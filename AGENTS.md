# Astro Boys: NASA Space Apps Challenge

Rules for anyone working in this repo: team members and AI coding agents alike.

## Rule: use the challenge's suggested tools

**We build with the tools, data and resources the chosen challenge suggests.**

- Once the challenge is picked, every suggested resource (datasets, APIs, platforms, libraries, partner-agency data)
  goes into [docs/challenge/suggested-tools.md](docs/challenge/suggested-tools.md).
- Default to those. Using something **not** on that list requires a `DECISION` diary entry explaining why the
  suggested option doesn't work.
- Every resource we actually use is credited in [docs/resources.md](docs/resources.md).

## Rule: English, and acknowledge AI use

- The submission page and **every linked material, this repo included,** must be in English.
- AI tools are allowed, but AI-generated code and data must be acknowledged in descriptive text and metadata,
  and AI must not be used to come up with the solution idea. Record AI use in
  [docs/resources.md](docs/resources.md#ai-usage). Details: [docs/challenge/official-requirements.md](docs/challenge/official-requirements.md#ai-super-intelligence-rules).

## The Diary Rule (non-negotiable)

**Everything that matters gets written in the diary, with a timestamp, when it happens.**
If it isn't in the diary, it didn't happen. The diary keeps us in sync, feeds the final
presentation, and shows the judges our process.

### What must be logged

| Type       | When to log it                                                               |
|------------|------------------------------------------------------------------------------|
| `DECISION` | Any choice between options: challenge, tech stack, dataset, scope cut, design |
| `DONE`     | A task, feature, or milestone finished                                        |
| `BLOCKER`  | Something is stuck, and on what or whom                                       |
| `IDEA`     | An idea worth keeping, even if we don't act on it                             |
| `MEETING`  | A team sync: who attended, what was agreed                                     |
| `NOTE`     | Anything else worth remembering (a finding, a link, a gotcha)                 |

### How to log

Use the helper, which adds the timestamp and author:

```bash
./scripts/log.sh decision "Use React + Vite for the frontend" "Why: team knows it, fastest to demo. Alternatives: Svelte (learning curve)."
./scripts/log.sh done "NASA POWER API client fetches daily temperature"
./scripts/log.sh blocker "Earthdata login failing for the MODIS download"
```

Or edit `docs/diary/YYYY-MM-DD.md` by hand using the format in [docs/diary/README.md](docs/diary/README.md).

### Format rules

- **Timestamps are UTC**, `HH:MM UTC`, one file per UTC day: `docs/diary/YYYY-MM-DD.md`.
- **Append only.** Never edit or delete past entries. To correct one, add a new entry that references it.
- Every `DECISION` states **what** was chosen, **why**, and the **alternatives** rejected.
- Big decisions (hard to reverse, or shaping the architecture) also get an ADR in
  [docs/decisions/](docs/decisions/), linked from the diary entry.
- Commit diary entries with the work they describe, or on their own as `docs(diary): ...`.

### For AI coding agents

- Read the latest diary file and [docs/tasks.md](docs/tasks.md) before starting work.
- Log as you go, not at the end. Entries are authored by the person you're working for (the default from `git config user.name`).
- An unaccepted suggestion is an `IDEA`, not a `DECISION`.
- Don't add AI attribution or co-author trailers to commits.

## Repo conventions

- Branches: `feat/<thing>`, `fix/<thing>`, `docs/<thing>`, `data/<thing>`. Once building starts, no direct pushes to `main`; open a PR.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `data:`, `chore:`.
- Never commit secrets (API keys, Earthdata credentials). Use `.env` (git-ignored) and document variables in `.env.example`.
- Large datasets stay out of git: download scripts go in `scripts/`, files in `data/` (git-ignored). See [data/README.md](data/README.md).
- Raw data is immutable. Every download is logged in `data/raw/SOURCES.md`. Processed datasets are versioned.
- Every figure used in the app or presentation states its source, period and unit.
- A change that affects metrics means regenerating the results in `artifacts/`.
- A task is done only when its deliverable exists, someone else can reproduce it, and it meets its acceptance criteria.

## Cloud and code rules

- **Google Cloud is primary, local is the fallback** ([ADR 0004](docs/decisions/0004-gcp-primary-local-fallback.md)).
  Write pipeline code that runs identically on a laptop and on the VM: paths come from `astro_fire.storage.uri()`,
  never hard-coded `gs://` or local paths. No BigQuery-only or other cloud-only processing.
- **Python + DuckDB + partitioned Parquet**, managed with `uv`. Add dependencies with `uv add`; commit `uv.lock`.
- Every pipeline run writes a manifest to `manifests/`.
- **Never create, change or delete cloud resources or IAM** without Kali. Infra scripts are dry runs unless `APPLY=1`.
- **No service-account keys**, ever. Use `gcloud auth application-default login` locally.
- Before committing: `make check` (secrets, .env, data files) and `make test`. CI runs the same.

## Scientific guardrails

Full list in [docs/project-plan.md](docs/project-plan.md#scientific-guardrails). The non-negotiables:

- MODIS and VIIRS are different instruments. Never treat raw counts as equivalent.
- Every processed row keeps `sensor`, `product` and its time reference.
- An active-fire detection is not burned area, a fire count, or impact.
- Model splits are chronological; no future information in features; always compare to a baseline.
- Say "risk", "probability", "critical period". Never promise a fire will happen.

## Where things live

```
src/astro_fire/                   pipeline package (config, storage layout, manifests, CLI `astro-fire`)
tests/                            pytest; tests/fixtures holds tiny real FIRMS samples
scripts/                          log.sh, firms_download.py, sync_data.sh, check_repo_hygiene.sh
infra/gcp/                        Google Cloud setup scripts (dry run unless APPLY=1) + VM bootstrap
deploy/cloudrun/                  dashboard deployment contract, deploy script, rollback
app/                              Dashboard team's app (their stack)
notebooks/                        exploration
data/                             local mirror of the bucket: raw/ interim/ processed/ artifacts/ manifests/ (git-ignored)
artifacts/                        small curated figures/metrics for the demo (committed)
presentation/                     script, slides, final media
docs/project-plan.md              goal, scope, architecture, guardrails, definition of done
docs/blocks/                      per-block tasks and acceptance criteria
docs/cloud/                       cloud architecture, storage layout, VM runbook, IAM, budget, fallback
docs/challenge/                   brief, official requirements, suggested tools
docs/data-access.md               how to get FIRMS MODIS + VIIRS history
docs/timeline.md · docs/tasks.md · docs/team.md · docs/risks.md
docs/methodology.md · docs/data-dictionary.md · docs/model-card.md
docs/resources.md                 everything we use, with credits
docs/diary/ · docs/decisions/     timestamped diary and ADRs
```

## Current status

**Challenge:** [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/), see [docs/challenge/brief.md](docs/challenge/brief.md).
**Deadline:** Sun Nov 15, 2026, 23:59 local event time. Submission requirements: [docs/challenge/official-requirements.md](docs/challenge/official-requirements.md).
**Teams:** Harmonization (FIRMS data → harmonized dataset) and Dashboard (web app). See [docs/team.md](docs/team.md).
