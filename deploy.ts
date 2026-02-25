#!/usr/bin/env bun

const IMAGE = "us-docker.pkg.dev/atomic-ehr/gcr.io/mqttb:latest";
const DEPLOYMENT = "mqttb";

async function run(cmd: string, description: string) {
  console.log(`\n→ ${description}...`);
  const proc = Bun.spawn(["sh", "-c", cmd], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`✗ Failed: ${description}`);
    process.exit(1);
  }
  console.log(`✓ ${description}`);
}

async function deploy() {
  const start = Date.now();

  console.log("=== MQTTB Deploy ===\n");

  // 1. Build for amd64
  await run(
    `docker buildx build --platform linux/amd64 -t ${IMAGE} --push .`,
    "Build & push image"
  );

  // 2. Restart deployment
  await run(
    `kubectl rollout restart deployment/${DEPLOYMENT}`,
    "Restart deployment"
  );

  // 3. Wait for rollout
  await run(
    `kubectl rollout status deployment/${DEPLOYMENT} --timeout=60s`,
    "Wait for rollout"
  );

  // 4. Show status
  await run(
    `kubectl get pods -l app=${DEPLOYMENT}`,
    "Pod status"
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== Done in ${elapsed}s ===`);

  // Show connection info
  const svc = Bun.spawnSync(["kubectl", "get", "svc", DEPLOYMENT, "-o", "jsonpath={.status.loadBalancer.ingress[0].ip}"]);
  const ip = svc.stdout.toString();
  if (ip) {
    console.log(`\nConnect: mqtt://${ip}:1883`);
    console.log(`Test:    bunx mqtt pub -h ${ip} -u admin -P secret123 -t test -m hello`);
  }
}

deploy();
