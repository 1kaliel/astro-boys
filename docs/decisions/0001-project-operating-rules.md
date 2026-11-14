# 0001: Project operating rules

- **Date:** 2026-11-14 11:20 UTC
- **Status:** accepted
- **Deciders:** Lucas

## Context

Hackathons move fast and the team works in parallel. Decisions made in chats and calls get
forgotten, and at the end we need to explain our process in the submission.

## Decision

1. **Decision diary.** Daily markdown files in `docs/diary/` with UTC timestamps, append-only,
   written via `scripts/log.sh`. Big decisions also get an ADR here in `docs/decisions/`.
2. **Challenge-suggested tools first.** We build with the tools and data the chosen challenge
   recommends. Deviating needs a logged `DECISION` with the reason.
3. **One shared rules file.** `AGENTS.md` holds the rules for humans and any AI coding agent.

## Options considered (for the diary)

1. **Chat history only**: zero effort, but unsearchable and scattered.
2. **Notion / Google Doc**: easy to edit, but lives outside the code and drifts.
3. **Markdown diary in the repo**: versioned with the code, greppable, works for humans and tools. **Chosen.**

## Consequences

- Everyone logs decisions, finished work and blockers as they happen.
- The diary becomes the raw material for the final write-up and presentation.
- The tech stack is decided only after the challenge (and its suggested tools) is known.
