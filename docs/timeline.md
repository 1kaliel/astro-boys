# Timeline

## Event dates (official)

| When (local, Brasília UTC−3) | What |
|------------------------------|------|
| Sat Nov 14, 2026, 09:00 | Hackathon started (H0) |
| **Sun Nov 15, 2026, 23:59** | **Submission closes. Hard deadline** (= Mon 02:59 UTC) |
| Check with Local Lead | Local judging and awards |

We **submit by Sun 22:30**, keeping 1.5 hours of margin.

## Where we are (Sat 18:30, H9.5)

- ✅ Repo, tooling, CI; Google Cloud project, bucket, VM, registry; 48 FIRMS zips (9.08 GiB) verified in the bucket.
- ✅ Research done; plan v2 drafted.
- ❌ The original Checkpoint 1 (harmonized v0 by Sat 17:00) was missed. No pipeline code and no app yet.
- **29.5 hours left; about 20 of them usable before the feature freeze.** The schedule below is rebuilt from now.

## Schedule (local time)

| Window | Harmonization | Dashboard | Required output |
|--------|---------------|-----------|-----------------|
| Sat 18:30–19:30 | **Lock-in:** answer the open decisions; freeze data contract v1 | **Lock-in:** choose the stack | Decisions logged; names on tasks |
| Sat 19:30 | Mock `calendar` sample delivered | | Dashboard unblocked |
| Sat 19:30–23:00 | `ingest` + `aggregate` on the VM (Northeast Brazil); calibration prototype on a sample | App skeleton: map + calendar heatmap on the mock | |
| **Sat 23:00** | **Checkpoint A** | | `cell_month_counts` for the Northeast exists; app shows a calendar locally |
| Sat 23:00–Sun 02:00 | `calibrate` + `harmonize` → `calendar/v1`; before/after chart | Area selection, median comparison, CSV download | |
| **Sun 02:00** | **Checkpoint B** | | `calendar/v1` in the bucket; app reads real data locally |
| Sun 02:00–07:00 | Rest. One person per team reachable; long jobs run in `tmux` on the VM | Rest | |
| Sun 07:00–11:00 | `validate` (baselines, K/M), bootstrap intervals, 2026 data, anomalies → `calendar/v1.1` | First Cloud Run deploy by 09:00; should-haves | |
| **Sun 11:00** | **Checkpoint C** | | Public URL with real harmonized data + validation table. Stretch go / no-go |
| Sun 11:00–15:00 | Should-haves; stretch only if "go"; methodology text | Should-haves; stretch only if "go"; demo storyboard | |
| **Sun 15:00** | **Feature freeze** | | Fixes only from here |
| Sun 15:00–19:00 | Reproducibility run, methodology, credits, AI-use text | Stabilize, final deploy, offline fallback, screenshots | Links work in a private window |
| Sun 19:00–22:00 | Project page text (English) | Demo: ≤ 30 s video or ≤ 7 slides | Page + demo complete |
| Sun 22:00–22:30 | Final check against [official-requirements.md](challenge/official-requirements.md) | | **Submitted**; confirmation saved |
| Sun 22:30–23:59 | Margin only | | |

## Checkpoint rules (decide on the spot, log it)

| Checkpoint | If it fails | Then |
|------------|-------------|------|
| **A** Sat 23:00 | No Northeast counts table | Cut to one state and fewer years; if the VM is the problem, run the Brazil CSVs locally |
| | App shows nothing | Switch to the single-Python-app option now |
| **B** Sun 02:00 | No `calendar/v1` | Ship the month × day/night ratio (no cell term) as v1; keep working on F + B in the morning |
| **C** Sun 11:00 | Not deployed | Deploy whatever runs, even with fewer features; if Cloud Run fails, record the demo from the local container |
| | Final method doesn't beat baselines | Ship the best baseline and say so; no stretch work |
| **Freeze** Sun 15:00 | Anything unfinished | It's cut. Reliability, docs and demo only |

## Milestone tracker

| Milestone | Target (local) | Status |
|-----------|----------------|--------|
| Repo, tooling, CI | Sat 12:00 | ✅ |
| Google Cloud foundation + raw data in the bucket | Sat 16:50 | ✅ |
| Plan v2 locked: roles, stack (FastAPI + SPA), pilot extent (Northeast) | Sat 18:15 | ✅ |
| Data contract v1 frozen; frontend framework named | Sat 19:30 | 🔄 React + Vite named; contract sign-off (L3) open |
| Mock sample to Dashboard | Sat 19:30 | ✅ (Sat 20:30, generator command) |
| Checkpoint A: counts table + app skeleton | Sat 23:00 | ✅ (counts Sat 21:13; calendar heatmap on a fixture Sat 22:40) |
| Checkpoint B: `calendar/v1` + app on real data | Sun 02:00 | ✅ data (final calendar with 2026, Sat 23:55); app API reads the real calendar |
| First Cloud Run deploy | Sun 09:00 | ✅ (Sun 00:55; sixth revision live Sun 06:27) |
| Checkpoint C: public URL + validation table | Sun 11:00 | ⬜ |
| Feature freeze | Sun 15:00 | ⬜ |
| Demo + project page complete | Sun 22:00 | ⬜ |
| Submission confirmed | Sun 22:30 | ⬜ |
