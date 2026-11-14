# Cloud Run runbook (dashboard)

The dashboard's planned home is **Cloud Run**: it scales to zero when nobody's using it, gives a public HTTPS URL
for the judges, and runs any container. **The Dashboard team chooses the framework.** This runbook only fixes
the contract the container has to meet.

## Container contract

Whatever the stack (Python, Node, static site behind a tiny server…), the image must:

1. **Serve HTTP on the port in `$PORT`** (Cloud Run sets it, usually 8080), listening on `0.0.0.0`.
2. **Be stateless.** No writing data to local disk that has to survive; instances come and go.
3. **Read data read-only**, in one of two ways:
   - **A. Read from Cloud Storage** at `$ASTRO_DATA_ROOT/processed/...` using the runtime service account
     (no key files). Works with DuckDB (`gcsfs` or the httpfs extension), pandas/pyarrow, or the JS GCS client.
   - **B. Bake a small extract into the image** (e.g. aggregated Parquet/JSON of a few MB). Simplest, fastest,
     works offline too. Rebuild the image when the data version changes.
   Option B is recommended for the demo if the aggregates are small; A if users query raw hotspots over large areas.
4. **Start fast** (under ~10 s) and **use ≤ 1 GiB RAM** by default (raise `--memory` in `deploy.sh` if needed).
5. **Have a `/healthz` (or `/`) route** that returns 200 quickly.
6. Contain **no secrets and no `.env`**. Add a `.dockerignore` excluding `.env`, `data/`, `.venv/`, `node_modules/`.

Put the app in [`app/`](../../app/) with its `Dockerfile` there (or set `APP_DIR`).

## Run the container locally first

```bash
docker build -t astro-dashboard app/
docker run --rm -p 8080:8080 -e PORT=8080 -e ASTRO_DATA_ROOT=/data -v "$PWD/data:/data:ro" astro-dashboard
```

If it works here, it will work on Cloud Run (same image, same `$PORT`).

## Deploy

Prerequisites, done once by Kali (see [docs/cloud/README.md](../../docs/cloud/README.md)): APIs enabled,
Artifact Registry repo, dashboard service account, and your account granted `artifactregistry.writer`,
`run.developer` and `iam.serviceAccountUser` on the dashboard service account.

```bash
cp deploy/cloudrun/service.env.example deploy/cloudrun/service.env   # fill in the bucket
./deploy/cloudrun/deploy.sh                                          # dry run: read the commands
APPLY=1 ./deploy/cloudrun/deploy.sh                                  # build, push, deploy
```

The image is tagged with the git commit, so every deploy is traceable. Defaults: 1 vCPU, 1 GiB,
min 0 / max 3 instances (cost cap), public URL only if `RUN_ALLOW_PUBLIC=true` in `infra/gcp/gcp.env`.

Public access needs the `allUsers` invoker binding; if an organization policy blocks it, deploy fails at that
step. Tell Kali.

## Rollback

Every deploy is a new revision; old ones stay available.

```bash
gcloud run revisions list --service "$RUN_SERVICE" --region "$GCP_REGION" --project "$GCP_PROJECT_ID"
gcloud run services update-traffic "$RUN_SERVICE" --region "$GCP_REGION" --project "$GCP_PROJECT_ID" \
  --to-revisions=<previous-revision>=100
```

## If Cloud Run is unavailable

Run the same container locally (above) and record the demo from it. Keep screenshots in `artifacts/screenshots/`.
Full fallback plan: [docs/cloud/fallback-and-rollback.md](../../docs/cloud/fallback-and-rollback.md).
