import { test, expect, beforeAll, afterAll } from "bun:test";
import Aedes from "aedes";
import { createServer, type Server } from "net";
import mqtt, { type MqttClient } from "mqtt";
import { unlink } from "fs/promises";

const PORT = 18830; // тестовый порт
const LOG_FILE = "mqtt-test.log";

let server: Server;
let aedes: Aedes;
let writer: ReturnType<typeof Bun.file.prototype.writer>;

beforeAll(async () => {
  // Удаляем старый лог
  await unlink(LOG_FILE).catch(() => {});

  // Запускаем брокер
  aedes = new Aedes();
  server = createServer(aedes.handle);

  const log = Bun.file(LOG_FILE);
  writer = log.writer();

  aedes.on("publish", (packet, client) => {
    if (packet.topic.startsWith("$SYS")) return; // игнорируем системные
    const line = `PUBLISH ${client?.id || "broker"} ${packet.topic} ${packet.payload}\n`;
    writer.write(line);
    writer.flush();
  });

  await new Promise<void>((resolve) => {
    server.listen(PORT, resolve);
  });
});

afterAll(async () => {
  aedes.close();
  server.close();
  await unlink(LOG_FILE).catch(() => {});
});

function createClient(clientId: string): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(`mqtt://localhost:${PORT}`, { clientId });
    client.on("connect", () => resolve(client));
    client.on("error", reject);
  });
}

test("client connects to broker", async () => {
  const client = await createClient("test-connect");
  expect(client.connected).toBe(true);
  client.end();
});

test("publish and subscribe works", async () => {
  const publisher = await createClient("test-publisher");
  const subscriber = await createClient("test-subscriber");

  const received: { topic: string; message: string }[] = [];

  await new Promise<void>((resolve) => {
    subscriber.subscribe("test/topic", () => resolve());
  });

  subscriber.on("message", (topic, message) => {
    received.push({ topic, message: message.toString() });
  });

  publisher.publish("test/topic", "hello world");

  // Ждём доставки
  await Bun.sleep(100);

  expect(received).toHaveLength(1);
  expect(received[0].topic).toBe("test/topic");
  expect(received[0].message).toBe("hello world");

  publisher.end();
  subscriber.end();
});

test("wildcard subscription works", async () => {
  const publisher = await createClient("test-pub-wild");
  const subscriber = await createClient("test-sub-wild");

  const received: string[] = [];

  await new Promise<void>((resolve) => {
    subscriber.subscribe("sensors/#", () => resolve());
  });

  subscriber.on("message", (topic) => {
    received.push(topic);
  });

  publisher.publish("sensors/room1/temp", "22");
  publisher.publish("sensors/room2/temp", "23");
  publisher.publish("sensors/room1/humidity", "65");
  publisher.publish("other/topic", "ignored");

  await Bun.sleep(100);

  expect(received).toHaveLength(3);
  expect(received).toContain("sensors/room1/temp");
  expect(received).toContain("sensors/room2/temp");
  expect(received).toContain("sensors/room1/humidity");
  expect(received).not.toContain("other/topic");

  publisher.end();
  subscriber.end();
});

test("messages are logged to file", async () => {
  const client = await createClient("test-logger");

  client.publish("log/test1", "value1");
  client.publish("log/test2", "value2");

  await Bun.sleep(100);
  client.end();

  const logContent = await Bun.file(LOG_FILE).text();

  expect(logContent).toContain("log/test1");
  expect(logContent).toContain("value1");
  expect(logContent).toContain("log/test2");
  expect(logContent).toContain("value2");
});

test("QoS 1 delivers at least once", async () => {
  const publisher = await createClient("test-qos1-pub");
  const subscriber = await createClient("test-qos1-sub");

  let received = false;

  await new Promise<void>((resolve) => {
    subscriber.subscribe("qos/test", { qos: 1 }, () => resolve());
  });

  subscriber.on("message", () => {
    received = true;
  });

  // Публикуем с QoS 1 и ждём подтверждения
  await new Promise<void>((resolve) => {
    publisher.publish("qos/test", "important", { qos: 1 }, () => resolve());
  });

  await Bun.sleep(100);

  expect(received).toBe(true);

  publisher.end();
  subscriber.end();
});
