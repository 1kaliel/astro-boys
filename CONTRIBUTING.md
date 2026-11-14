# Contributing

## Workflow

1. Pick a task from [docs/tasks.md](docs/tasks.md) or a GitHub issue and put your name on it.
2. Branch from `main`: `feat/<thing>`, `fix/<thing>`, `docs/<thing>`, `data/<thing>`.
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `feat: add map layer`.
4. Log it: `./scripts/log.sh done "..."`, plus any decisions you made along the way.
5. Open a PR, fill in the template, get one teammate to review, merge.

## Rules

- Use the challenge's suggested tools first ([docs/challenge/suggested-tools.md](docs/challenge/suggested-tools.md)).
- No secrets in git. Use `.env` and keep `.env.example` up to date.
- No large data files in git. Write a download script in `scripts/` instead.
- Credit every external source in [docs/resources.md](docs/resources.md).
- Diary entries are append-only. Full rules in [AGENTS.md](AGENTS.md).
