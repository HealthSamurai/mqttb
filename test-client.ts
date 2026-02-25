import mqtt from "mqtt";

const client = mqtt.connect("mqtt://localhost:1883", {
  clientId: "test-client-" + Math.random().toString(36).slice(2, 8),
});

client.on("connect", () => {
  console.log("Connected!");

  // Подписываемся
  client.subscribe("test/#");

  // Публикуем несколько сообщений
  client.publish("test/temperature", "23.5");
  client.publish("test/humidity", "65");
  client.publish("sensors/room1/temp", "22.0");

  setTimeout(() => {
    client.end();
    console.log("Done!");
    process.exit(0);
  }, 1000);
});

client.on("message", (topic, message) => {
  console.log(`Received: ${topic} = ${message.toString()}`);
});
