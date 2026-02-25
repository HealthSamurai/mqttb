# mqttb

MQTT broker + REST API for Apple Health data collection.

## API

### Health Check
```
GET /health
```

### Data API

**Save data:**
```
POST /api/data/:name
Content-Type: application/json

{"your": "data"}
```
Response: `{"success": true, "filename": "name-2026-02-04T16-46-43-038Z", "timestamp": "..."}`

**List files:**
```
GET /api/data
```
Response: `["name-2026-02-04T16-46-43-038Z", ...]`

**Get file:**
```
GET /api/data/:filename
```

**Delete file:**
```
DELETE /api/data/:filename
```

### Legacy endpoint
```
POST /api/health
```
Saves to `health-<timestamp>.json`

## Local Development

```bash
bun install
bun run server.ts
```

## Deployment (GKE)

### Prerequisites
- GKE cluster with Workload Identity enabled
- GCS bucket: `apple-health-data-atomic`
- Service account: `mqttb-sa@atomic-ehr.iam.gserviceaccount.com`

### Deploy
```bash
bun run deploy.ts
```

### Manual setup

1. Create GCS bucket:
```bash
gcloud storage buckets create gs://apple-health-data-atomic --project=atomic-ehr --location=us-central1
```

2. Create GCP service account:
```bash
gcloud iam service-accounts create mqttb-sa --display-name="MQTTB Service Account"
```

3. Grant GCS access:
```bash
gcloud storage buckets add-iam-policy-binding gs://apple-health-data-atomic \
  --member="serviceAccount:mqttb-sa@atomic-ehr.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

4. Bind Workload Identity:
```bash
gcloud iam service-accounts add-iam-policy-binding mqttb-sa@atomic-ehr.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:atomic-ehr.svc.id.goog[default/mqttb-sa]"
```

5. Create K8s service account:
```bash
kubectl create serviceaccount mqttb-sa
kubectl annotate serviceaccount mqttb-sa \
  iam.gke.io/gcp-service-account=mqttb-sa@atomic-ehr.iam.gserviceaccount.com
```

6. Apply manifests:
```bash
kubectl apply -f k8s.yaml
kubectl apply -f ingress.yaml
```

## Endpoints

- MQTT: `mqtt://34.30.243.246:1883`
- HTTP (direct): `http://34.30.243.246:8080`
- HTTPS: `https://apple-health.apki.dev`
