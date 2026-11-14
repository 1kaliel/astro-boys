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

## Scientific guardrails

Full list in [docs/project-plan.md](docs/project-plan.md#scientific-guardrails). The non-negotiables:

- MODIS and VIIRS are different instruments. Never treat raw counts as equivalent.
- Every processed row keeps `sensor`, `product` and its time reference.
- An active-fire detection is not burned area, a fire count, or impact.
- Model splits are chronological; no future information in features; always compare to a baseline.
- Say "risk", "probability", "critical period". Never promise a fire will happen.

## Where things live

```
docs/project-plan.md              the plan: goal, scope, architecture, guardrails, definition of done
docs/blocks/                      per-block tasks and acceptance criteria (01 harmonization, 02 calendar, 03 anomalies/prediction)
docs/timeline.md                  event dates, schedule, checkpoints
docs/tasks.md                     task board, first-hour decisions, workstream status
docs/team.md                      six roles, backups, support pairs
docs/risks.md                     risks and contingency plans
docs/methodology.md               methods as decided (living document)
docs/data-dictionary.md           every field in the harmonized dataset
docs/model-card.md                prediction PoC: target, data, baseline, results, limits
docs/challenge/                   brief, official requirements, suggested tools
docs/data-access.md               how to get FIRMS MODIS + VIIRS history
docs/resources.md                 everything we use, with credits
docs/diary/                       daily timestamped log
docs/decisions/                   ADRs for big decisions
docs/plan/                        original plan documents
data/                             raw/ (immutable), interim/, processed/ (git-ignored except docs)
notebooks/                        exploration and experiments
src/                              pipeline, analysis and app code
scripts/                          helpers (log.sh, data downloads)
tests/                            data checks and tests for critical functions
artifacts/                        metrics, figures, backup screenshots
presentation/                     script, slides, final media
```

## Current status

**Challenge:** [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/), see [docs/challenge/brief.md](docs/challenge/brief.md).
**Deadline:** Sun Nov 15, 2026, 23:59 local event time. Submission requirements: [docs/challenge/official-requirements.md](docs/challenge/official-requirements.md).
**Teams:** Harmonization (FIRMS data → harmonized dataset) and Dashboard (web app). See [docs/team.md](docs/team.md).
