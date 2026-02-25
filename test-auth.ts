import mqtt from "mqtt";

// Тест 1: Без логина — должен отказать
console.log("Test 1: No credentials...");
const client1 = mqtt.connect("mqtt://localhost:1883", {
  clientId: "no-auth-client",
});

client1.on("error", (err) => {
  console.log("✓ Rejected without credentials:", err.message);
  client1.end();
});

client1.on("connect", () => {
  console.log("✗ Should not connect without credentials!");
  client1.end();
});

// Тест 2: Неправильный пароль — должен отказать
setTimeout(() => {
  console.log("\nTest 2: Wrong password...");
  const client2 = mqtt.connect("mqtt://localhost:1883", {
    clientId: "wrong-pass-client",
    username: "admin",
    password: "wrongpass",
  });

  client2.on("error", (err) => {
    console.log("✓ Rejected with wrong password:", err.message);
    client2.end();
  });

  client2.on("connect", () => {
    console.log("✗ Should not connect with wrong password!");
    client2.end();
  });
}, 500);

// Тест 3: Правильный логин — должен подключиться
setTimeout(() => {
  console.log("\nTest 3: Correct credentials...");
  const client3 = mqtt.connect("mqtt://localhost:1883", {
    clientId: "admin-client",
    username: "admin",
    password: "secret123",
  });

  client3.on("connect", () => {
    console.log("✓ Connected with correct credentials!");
    client3.publish("test/auth", "authenticated message");
    setTimeout(() => {
      client3.end();
      console.log("\nAll tests done!");
      process.exit(0);
    }, 500);
  });

  client3.on("error", (err) => {
    console.log("✗ Should connect with correct credentials:", err.message);
    client3.end();
  });
}, 1000);
