# Timeline

## Event dates (official)

| When (Local Event time) | What |
|-------------------------|------|
| **Sat Nov 14, 2026, 09:00** | Hackathon starts, project submission opens (**H0**) |
| **Sun Nov 15, 2026, 23:59** | **Submission closes. Hard deadline.** (≈ H39) |
| Check with Local Lead | Local judging and awards |

**Local Event timezone: Brasília time (UTC−3), confirmed.** H0 = Sat 12:00 UTC; deadline = Mon Nov 16, 02:59 UTC.

Plan v1 assumed 48 hours. The real window is **about 39 hours**, so the schedule below is compressed.
We aim to **submit by Sun 22:30 local**, keeping 1.5 hours of margin.

## Schedule (local time)

Both teams work in parallel. Dashboard builds against a sample file until the harmonized data is ready.

| Window | Local time | Harmonization team | Dashboard team | Required output |
|--------|------------|--------------------|----------------|-----------------|
| H0–H2 | Sat 09:00–11:00 | Align; get FIRMS key; start data pull | Align; pick stack | Roles, data contract v0, stack logged |
| H2–H5 | Sat 11:00–14:00 | Raw MODIS + VIIRS in `data/raw/`, cleaning | App skeleton: map + AOI + date range | Sample file shared with Dashboard |
| H5–H8 | Sat 14:00–17:00 | Overlap comparison; harmonization method v0 | Calendar view on sample data | Dataset v0 |
| **H8** | **Sat 17:00** | **Checkpoint 1** | | Harmonized v0 meets minimum criteria, or scope cut |
| H8–H14 | Sat 17:00–23:00 | Monthly aggregates, historical median, anomalies | Calendar, trends, anomalies on real data | End-to-end demo on real data |
| **H14** | **Sat 23:00** | **Checkpoint 2** | | App runs end to end without editing code |
| H14–H24 | Sat 23:00–Sun 09:00 | Validation report, sensitivity, methodology doc (rest in shifts) | CSV / chart downloads, accessibility, polish | |
| **H26** | **Sun 11:00** | **Checkpoint 3** | | Go / no-go on stretch goals |
| **H30** | **Sun 15:00** | **Feature freeze** | | No new features, only fixes |
| H30–H34 | Sun 15:00–19:00 | Docs, credits, reproducibility check | Deploy, offline fallback, screenshots | Public link works in a private window |
| H34–H37 | Sun 19:00–22:00 | Project page text | Demo video (≤ 30 s) or slides (≤ 7) | Demo + page drafted, in English |
| H37–H37.5 | Sun 22:00–22:30 | Final check against [official-requirements.md](challenge/official-requirements.md) | | **Submitted**, confirmation saved |
| H37.5–H39 | Sun 22:30–23:59 | Margin only | | |

## Checkpoint rules

- **H8:** harmonization failing → shrink area and/or period. Never move on with data lacking provenance.
- **H14:** app not working end to end → freeze new views; finish what exists.
- **H26:** stretch goals (prediction, extra layers) only continue if the core calendar is solid.
- **H30:** feature freeze. Reliability, docs, demo.

## Milestone tracker

| Milestone | Target (local) | Status |
|-----------|----------------|--------|
| Roles, stack, data contract v0 | Sat 11:00 | ⬜ |
| Sample data shared with Dashboard | Sat 14:00 | ⬜ |
| Harmonized dataset v0 | Sat 17:00 | ⬜ |
| End-to-end demo on real data | Sat 23:00 | ⬜ |
| Stretch go / no-go | Sun 11:00 | ⬜ |
| Feature freeze | Sun 15:00 | ⬜ |
| Public link + demo ready | Sun 22:00 | ⬜ |
| Submission confirmed | Sun 22:30 | ⬜ |
