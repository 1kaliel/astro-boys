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

   **Chosen (D8):** the calendar (`processed/calendar/v1`, ~71 MB) is **baked in (B)**; the native hotspots for the
   CSV download (`hotspots/v1`, 883 MB) are **read from the bucket (A)** in D6. Conditions agreed with Kali: the
   calendar enters only at build time (a named build context from the git-ignored `data/`, never git), the image
   records its `model_version` (label `astro.model_version`, env `ASTRO_MODEL_VERSION`, `/api/version`), and
   nothing but the calendar is baked. Added on 2026-11-15, asked by Kali: `processed/month_to_date/v1` (60 KB,
   the same days of earlier years for the unfinished month) is baked with the calendar, the same way.

   **D6 (CSV):** set `ASTRO_HOTSPOTS_ROOT: "gs://<bucket>/astro/processed/hotspots/v1"` in `service.env`. The
   `astro-dashboard` service account needs `roles/storage.objectViewer` on `processed/`
   ([IAM](../../docs/cloud/iam-and-access.md)); Kali grants it. The request timeout is 300 s because large CSVs
   are streamed; only the files of the requested years are read (about 60 to 90 MB per year).
4. **Start fast** (under ~10 s) and **use ≤ 1 GiB RAM** by default (raise `--memory` in `deploy.sh` if needed).
5. **Have a `/healthz` (or `/`) route** that returns 200 quickly.
6. Contain **no secrets and no `.env`**. Add a `.dockerignore` excluding `.env`, `data/`, `.venv/`, `node_modules/`.

Put the app in [`app/`](../../app/) with its `Dockerfile` there (or set `APP_DIR`).

## Run the container locally first

```bash
APPLY=1 ./scripts/sync_data.sh pull processed calendar/v1        # local copy in data/ (git-ignored), ~71 MB
APPLY=1 ./scripts/sync_data.sh pull processed month_to_date/v1   # 60 KB; pull both at the same time
MODEL=$(cd app/backend && uv run --project .. python -m astro_dashboard.bake --print-model-version \
  ../../data/processed/calendar/v1)
docker build -t astro-dashboard --build-context calendar=data/processed/calendar/v1 \
  --build-context month_to_date=data/processed/month_to_date/v1 --build-arg MODEL_VERSION="$MODEL" app/
docker run --rm -p 8080:8080 -e PORT=8080 --memory 1g astro-dashboard
curl http://localhost:8080/api/version                             # model_version of the baked calendar
```

The build fails if the calendar is missing, if its `model_version` is not `MODEL_VERSION`, or if `month_to_date`
covers other days than the calendar's unfinished month. For an image without
data (skeleton checks only) add `--build-arg ALLOW_NO_CALENDAR=1`. If it works here, it will work on Cloud Run
(same image, same `$PORT`). `deploy.sh` does the same build from `data/processed/calendar/v1` (or `CALENDAR_DIR`)
and `data/processed/month_to_date/v1` (or `TO_DATE_DIR`).

## Deploy

Prerequisites, done once by Kali (see [docs/cloud/README.md](../../docs/cloud/README.md)): APIs enabled,
Artifact Registry repo, dashboard service account, and your account granted `artifactregistry.writer`,
`run.developer` and `iam.serviceAccountUser` on the dashboard service account.

```bash
cp deploy/cloudrun/service.env.example deploy/cloudrun/service.env   # no ASTRO_DATA_ROOT: the calendar is baked
APPLY=1 ./scripts/sync_data.sh pull processed calendar/v1            # the calendar to bake (D8)
APPLY=1 ./scripts/sync_data.sh pull processed month_to_date/v1       # baked with it (same days of earlier years)
./deploy/cloudrun/deploy.sh                                          # dry run: read the commands
APPLY=1 ./deploy/cloudrun/deploy.sh                                  # build, push, deploy
```

No Docker with BuildKit on your machine? Build on Cloud Build instead (same Dockerfile and build contexts, see
[cloudbuild.yaml](cloudbuild.yaml)): `BUILDER=cloudbuild ./deploy/cloudrun/deploy.sh`. It builds the **committed**
app (`git archive HEAD`) with the two local data folders, as the build service account `astro-build` (created once
by Kali with `infra/gcp/45-build-service-account.sh`; or set `CLOUDBUILD_SA`). The first build creates the source bucket
`gs://<project>_cloudbuild` (set `CLOUDBUILD_STAGING=gs://...` to use another place) and build minutes are billed.

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
