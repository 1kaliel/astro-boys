# Team

Six people: two teams and a floater. Max team size for Space Apps is 6; everyone must be registered on the same Local Event.

> Roles confirmed by the team on Sat Nov 14. Tasks per person: [tasks.md](tasks.md).
> **The owner of a task decides its specifics**, within the guardrails and the data contract.

## Team Harmonization

Turns raw FIRMS hotspots into the harmonized dataset. Spec: [spec/harmonization.md](spec/harmonization.md).

| Name | GitHub | Role | Backup |
|------|--------|------|--------|
| Mateus | [Mateus-Ed-Dev](https://github.com/Mateus-Ed-Dev) | Pipeline and cloud: ingest, aggregate, harmonize, export, VM runs; data contract | Kali |
| Justino | [Gabriel-S-Justino](https://github.com/Gabriel-S-Justino) | Data and QA: provenance, QA report, 2026 API pull, credits, methodology text | Mateus |
| Kali | [1kaliel](https://github.com/1kaliel) | Method and validation: factors, pooling, baselines, cross-validation, bootstrap, charts. Project owner for Google Cloud and scope | Justino |

## Team Dashboard

Builds the web app. Spec: [spec/dashboard.md](spec/dashboard.md). The stack is this team's choice.

| Name | GitHub | Role | Backup |
|------|--------|------|--------|
| Guilherme | [Guilherme-Martins-Dev](https://github.com/Guilherme-Martins-Dev) | Map and area selection; backend and deploy (with Cleber) | Cleber |
| Cleber | [Clbrfrancaa](https://github.com/Clbrfrancaa) | Calendar and charts; backend and deploy (with Guilherme) | Guilherme |

Stack: **FastAPI backend + single-page frontend** (option A in the spec); frontend framework to be named by the team.

## Floater

| Name | GitHub | Role |
|------|--------|------|
| Jean | [JeanGust4](https://github.com/JeanGust4) | Diary keeper (logs decisions, done, blockers for the whole team) and floater: helps wherever a task is behind. Demo lead (S2), UI text, screenshots |

## Shared responsibilities

| Responsibility | Owner |
|----------------|----------------|
| Final say on scope; submission page; AI-use statement | Kali |
| Submission owner: final upload and confirmation (S6) | Kali |
| Data contract (one per team) | Mateus + Guilherme |
| Demo lead (S2): seven slides in English, including title and intro | Jean |
| Diary | Jean |
| Official requirements check | Kali |
| Final cross-team review of public links and English materials (S5) | Justino |
| References and credits ([resources.md](resources.md)) | Justino |

## The hand-off between teams

The teams meet at the **data contract**: [data-dictionary.md](data-dictionary.md). Dashboard builds against a
mock with the same columns until `calendar/v1` exists (Checkpoint B).

## Working agreements

- Check-in at every checkpoint (Sat 23:00, Sun 02:00, Sun 11:00, Sun 15:00): done, blockers, next.
- Stuck for more than 30 minutes? Log a `BLOCKER` and tell the team.
- A task is done only when its deliverable exists, someone else can reproduce it, and it meets its acceptance criteria.
- Decisions are logged in the diary by whoever makes them. Scope cuts at checkpoints follow [timeline.md](timeline.md).
- Rest is planned (Sun 02:00–07:00). Long jobs run in `tmux` on the VM.
- Anything taken from outside the team (code, text, images, numbers) is listed in [resources.md](resources.md).
  We don't copy other teams' solutions.


## Final-delivery assignment (L4)

At Jean Gustavo's request, the remaining delivery assignments are named: Jean leads the seven-slide English demonstration, Kali remains the submission owner, and Jean selected Justino for the final cross-team review. See [delivery-roles.md](delivery-roles.md). These are task assignments, not evidence that a demo, final review or submission has been completed. Other task ownership and Kali's approval of cloud changes remain as recorded.
