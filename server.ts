import Aedes, { type AuthenticateError, type Client } from "aedes";
import { createServer } from "net";

// Простая база пользователей (в проде — из БД/env)
const USERS: Record<string, string> = {
  admin: "secret123",
  device1: "dev1pass",
  device2: "dev2pass",
};

const aedes = new Aedes({
  // Увеличиваем таймауты для мобильных клиентов
  heartbeatInterval: 60000,    // 60 сек между heartbeat
  connectTimeout: 30000,       // 30 сек на подключение

  // Логируем все детали подключения
  preConnect: (client, packet, callback) => {
    console.log(`PRE_CONNECT: ${client.id}`);
    console.log(`  protocol: ${packet.protocolId} v${packet.protocolVersion}`);
    console.log(`  keepalive: ${packet.keepalive}s`);
    console.log(`  clean: ${packet.clean}`);
    console.log(`  username: ${packet.username || "(none)"}`);
    callback(null, true);
  },

  // Разрешаем публикацию всем
  authorizePublish: (client, packet, callback) => {
    console.log(`AUTHORIZE_PUB: ${client?.id} -> ${packet.topic}`);
    callback(null);
  },

  // Разрешаем подписку всем
  authorizeSubscribe: (client, sub, callback) => {
    console.log(`AUTHORIZE_SUB: ${client?.id} -> ${sub.topic}`);
    callback(null, sub);
  },

  // Аутентификация по MQTT спеке (CONNECT packet: username + password)
  authenticate: (
    client: Client,
    username: Readonly<string> | undefined,
    password: Readonly<Buffer> | undefined,
    callback
  ) => {
    const pwd = password?.toString();

    // Без логина — разрешаем анонимный доступ
    if (!username) {
      console.log(`AUTH OK: anonymous (${client.id})`);
      return callback(null, true);
    }

    // Проверка пароля
    if (USERS[username] === pwd) {
      console.log(`AUTH OK: ${username}`);
      return callback(null, true);
    }

    console.log(`AUTH FAIL: ${username}`);
    const error = new Error("Bad credentials") as AuthenticateError;
    error.returnCode = 5; // CONNACK: Not authorized
    callback(error, false);
  },
});

const server = createServer((socket) => {
  console.log(`SOCKET OPEN: ${socket.remoteAddress}:${socket.remotePort}`);

  socket.on("error", (err) => {
    console.log(`SOCKET ERROR: ${err.message}`);
  });

  socket.on("close", (hadError) => {
    console.log(`SOCKET CLOSE: hadError=${hadError}`);
  });

  socket.on("timeout", () => {
    console.log(`SOCKET TIMEOUT`);
  });

  // Увеличиваем таймаут сокета
  socket.setTimeout(120000); // 2 минуты

  aedes.handle(socket);
});

const log = Bun.file("mqtt.log");
const writer = log.writer();

// Клиент подключился
aedes.on("client", (client) => {
  const line = `${new Date().toISOString()} CONNECT ${client.id}\n`;
  writer.write(line);
  console.log(line.trim());
});

// Клиент отключился
aedes.on("clientDisconnect", (client) => {
  const line = `${new Date().toISOString()} DISCONNECT ${client.id}\n`;
  writer.write(line);
  console.log(line.trim());
});

// Подписка
aedes.on("subscribe", (subscriptions, client) => {
  const topics = subscriptions.map((s) => s.topic).join(", ");
  const line = `${new Date().toISOString()} SUBSCRIBE ${client.id} [${topics}]\n`;
  writer.write(line);
  console.log(line.trim());
});

// Сообщение опубликовано
aedes.on("publish", (packet, client) => {
  // Пропускаем системные $SYS сообщения в логах
  if (packet.topic.startsWith("$SYS")) return;

  const clientId = client?.id || "broker";
  const payload = packet.payload.toString();
  const line = `${new Date().toISOString()} PUBLISH ${clientId} ${packet.topic} ${payload}\n`;
  writer.write(line);
  writer.flush();
  console.log(line.trim());
});

// Ошибка клиента
aedes.on("clientError", (client, error) => {
  const line = `${new Date().toISOString()} ERROR ${client.id} ${error.message}\n`;
  writer.write(line);
  writer.flush();
  console.log(line.trim());
});

// Ошибка соединения
aedes.on("connectionError", (client, error) => {
  const line = `${new Date().toISOString()} CONN_ERROR ${client.id} ${error.message}\n`;
  writer.write(line);
  writer.flush();
  console.log(line.trim());
});

// Ping от клиента
aedes.on("ping", (packet, client) => {
  console.log(`${new Date().toISOString()} PING ${client.id}`);
});

// Ack подтверждения
aedes.on("ack", (packet, client) => {
  console.log(`${new Date().toISOString()} ACK ${client.id} messageId=${(packet as any).messageId}`);
});

// === MQTT Server ===
const MQTT_PORT = 1883;
server.listen(MQTT_PORT, () => {
  console.log(`MQTT broker running on port ${MQTT_PORT}`);
});

// === HTTP Server для REST API ===
const HTTP_PORT = 8080;
const DATA_DIR = "./data";

import { mkdirSync, readdirSync } from "node:fs";
mkdirSync(DATA_DIR, { recursive: true });

async function listFiles(): Promise<string[]> {
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort()
    .reverse();
}

async function saveFile(filename: string, data: any): Promise<void> {
  await Bun.write(`${DATA_DIR}/${filename}`, JSON.stringify(data, null, 2));
}

async function readFile(filename: string): Promise<string | null> {
  const file = Bun.file(`${DATA_DIR}/${filename}`);
  if (!(await file.exists())) return null;
  return file.text();
}

async function deleteFile(filename: string): Promise<boolean> {
  const file = Bun.file(`${DATA_DIR}/${filename}`);
  if (!(await file.exists())) return false;
  const { unlinkSync } = await import("node:fs");
  unlinkSync(`${DATA_DIR}/${filename}`);
  return true;
}

const httpServer = Bun.serve({
  port: HTTP_PORT,
  routes: {
    // Health check
    "/health": new Response("OK"),

    // Список всех файлов (оба варианта: с и без слеша)
    "/api/data": {
      GET: async () => {
        const files = await listFiles();
        return Response.json(files);
      },
    },
    "/api/data/": {
      GET: async () => {
        const files = await listFiles();
        return Response.json(files);
      },
    },

    // POST/GET/DELETE для конкретного файла
    "/api/data/:name": {
      // Сохранить данные: POST /api/data/health
      POST: async (req) => {
        try {
          const name = req.params.name;
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `${name}-${timestamp}.json`;

          const contentType = req.headers.get("content-type") || "";
          let data: any;

          if (contentType.includes("application/json")) {
            data = await req.json();
          } else {
            data = await req.text();
          }

          // Сохраняем в GCS
          await saveFile(filename, data);

          // Логируем
          console.log(`${new Date().toISOString()} HTTP POST /api/data/${name} -> ${filename}`);
          console.log(JSON.stringify(data, null, 2).slice(0, 500));

          return Response.json({
            success: true,
            filename: filename.replace(".json", ""),
            timestamp
          });
        } catch (error) {
          console.error("HTTP ERROR:", error);
          return Response.json({ error: String(error) }, { status: 500 });
        }
      },

      // Загрузить данные: GET /api/data/health-2024-01-01T12-00-00-000Z
      GET: async (req) => {
        const name = req.params.name;
        const content = await readFile(`${name}.json`);
        if (content) {
          return new Response(content, {
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json({ error: "Not found" }, { status: 404 });
      },

      // Удалить данные: DELETE /api/data/health-2024-01-01T12-00-00-000Z
      DELETE: async (req) => {
        const name = req.params.name;
        const deleted = await deleteFile(`${name}.json`);
        if (deleted) {
          console.log(`${new Date().toISOString()} HTTP DELETE /api/data/${name}`);
          return Response.json({ success: true, deleted: name });
        }
        return Response.json({ error: "Not found" }, { status: 404 });
      },
    },

    // Backward compatibility: POST /api/health -> POST /api/data/health
    "/api/health": {
      POST: async (req) => {
        const name = "health";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${name}-${timestamp}.json`;

        const contentType = req.headers.get("content-type") || "";
        let data: any;

        if (contentType.includes("application/json")) {
          data = await req.json();
        } else {
          data = await req.text();
        }

        await saveFile(filename, data);
        console.log(`${new Date().toISOString()} HTTP POST /api/health -> ${filename}`);
        console.log(JSON.stringify(data, null, 2).slice(0, 500));

        return Response.json({ success: true, filename: filename.replace(".json", ""), timestamp });
      },
    },
  },

  // Fallback
  fetch(req) {
    const url = new URL(req.url);
    console.log(`${new Date().toISOString()} HTTP ${req.method} ${url.pathname}`);
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`HTTP server running on port ${HTTP_PORT}`);
console.log(`  POST   /api/data/:name - save data`);
console.log(`  GET    /api/data/      - list files`);
console.log(`  GET    /api/data/:id   - download file`);
console.log(`  DELETE /api/data/:id   - delete file`);
console.log(`Logging to mqtt.log`);
