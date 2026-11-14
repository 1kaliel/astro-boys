# Astro Boys: NASA Space Apps Challenge

Rules for anyone working in this repo: team members and AI coding agents alike.

## Rule: use the challenge's suggested tools

**We build with the tools, data and resources the chosen challenge suggests.**

- Once the challenge is picked, every suggested resource (datasets, APIs, platforms, libraries, partner-agency data)
  goes into [docs/challenge/suggested-tools.md](docs/challenge/suggested-tools.md).
- Default to those. Using something **not** on that list requires a `DECISION` diary entry explaining why the
  suggested option doesn't work.
- Every resource we actually use is credited in [docs/resources.md](docs/resources.md).

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
- Large datasets stay out of git: download scripts go in `scripts/`, files in `data/raw/` (git-ignored).

## Where things live

```
docs/diary/                       daily timestamped log
docs/decisions/                   ADRs for big decisions
docs/tasks.md                     task board (owner, status)
docs/timeline.md                  event schedule and our milestones
docs/team.md                      who's who
docs/challenge/selection.md       picking the challenge
docs/challenge/suggested-tools.md the challenge's recommended tools and data (our default stack)
docs/resources.md                 everything we use, with credits
scripts/                          helpers (log.sh, data downloads)
src/                              project code (structure decided after the challenge is picked)
data/                             local data (raw/ and processed/ are git-ignored)
```

## Current status

**Challenge: NOT YET CHOSEN.** Update this line once decided.
