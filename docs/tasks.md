# Task board

Status: ⬜ not started · 🔄 in progress · ✅ done · ⛔ blocked / needs a decision

A task is done only when its deliverable exists, someone else can reproduce it, and it meets its acceptance criteria.
**The hackathon is running now** (Sat Nov 14 09:00 → Sun Nov 15 23:59 local). See [timeline.md](timeline.md).

## Shared (everyone)

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Confirm all 6 are registered on the **same Local Event** and listed on the team's Members tab | | ⬜ | Eligibility rule |
| 2 | Confirm the Local Event timezone; fix UTC times in `timeline.md` | Kali | ✅ | Brasília (UTC−3) |
| 3 | Name the submission owner and the demo lead (`team.md`) | | ⬜ | |
| 4 | Agree the data contract: harmonized dataset schema (`data-dictionary.md`) | 1 per team | ⬜ | Unblocks Dashboard |
| 5 | Note where AI tools are used, for the disclosure at the end | Everyone | 🔄 | Written up at submission (S4) |

## Team Harmonization (Kali, Justino, Mateus)

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| H1 | Get a FIRMS MAP_KEY; put it in `.env` | | ⬜ | Free, by email |
| H2 | Pick the area and period for the data pull | | ⬜ | Log as `DECISION` |
| H3 | Pull MODIS + VIIRS history (see `data-access.md`); log in `data/raw/SOURCES.md` | | ⬜ | |
| H4 | Share a small sample file with Dashboard | | ⬜ | By Sat 14:00 |
| H5 | Overlap comparison and harmonization method v0 | | ⬜ | Checkpoint Sat 17:00 |
| H6 | Monthly aggregates, historical median, anomalies | | ⬜ | |
| H7 | Validation report + methodology doc | | ⬜ | |

Full criteria: [blocks/01-harmonization.md](blocks/01-harmonization.md).

## Team Dashboard (Cleber, Guilherme, Jean)

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| D1 | Pick the stack (framework, map library, hosting); log as `DECISION` | | ⬜ | |
| D2 | App skeleton: map, AOI drawing or lat/lon input, date range | | ⬜ | |
| D3 | Burning calendar (month × year) with an accessible color ramp | | ⬜ | Core of the brief |
| D4 | Trends; current month vs historical median; anomalies | | ⬜ | |
| D5 | CSV download of hotspots; download of charts/analytics | | ⬜ | |
| D6 | Deploy to a public link; offline fallback; screenshots | | ⬜ | Before Sun 19:00 |

Full criteria: [blocks/02-historical-calendar.md](blocks/02-historical-calendar.md).

## Submission

| # | Task | Owner | Status |
|---|------|-------|--------|
| S1 | Project page fields drafted in English | | ⬜ |
| S2 | Demo: 30 s video (English subtitles if not English) or ≤ 7 slides | | ⬜ |
| S3 | References field lists every data source, library and tool | | ⬜ |
| S4 | AI-use disclosure: submission form + `resources.md` AI section | | ⬜ |
| S5 | All links tested in a private window | | ⬜ |
| S6 | Submitted and confirmation saved | | ⬜ |
