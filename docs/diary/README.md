# The Diary

One file per UTC day, named `YYYY-MM-DD.md`. Append-only: never rewrite history, add a correction instead.

## Entry format

```markdown
## HH:MM UTC · TYPE · author

One-line summary of what happened.

Optional details. For a DECISION, always include:
- **Why:** the reasoning
- **Alternatives:** what we rejected and why
- **ADR:** link to docs/decisions/NNNN-*.md if it's a big one
```

`TYPE` is one of `DECISION`, `DONE`, `BLOCKER`, `IDEA`, `MEETING`, `NOTE`.

## Quick add

```bash
./scripts/log.sh decision "Picked challenge X" "Why: ... Alternatives: Y (too data-heavy), Z (no domain expert)."
./scripts/log.sh done "Landing page deployed"
```

## Finding things later

```bash
grep -rn "DECISION" docs/diary/     # every decision ever made
grep -rn "BLOCKER" docs/diary/      # every blocker
```
