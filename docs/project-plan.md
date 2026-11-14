# Project plan (v1)

> Working plan for a 6-person team in two teams (Harmonization, Dashboard). Hackathon: Sat Nov 14 09:00 → Sun Nov 15 23:59 local (~39 h).
> Source: [plan v1 (Portuguese original)](plan/plan-v1-original-pt.md). This is the structured English version; when they disagree, this file plus the diary win.

**Challenge:** [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/). Our summary: [challenge/brief.md](challenge/brief.md).

**What we build:** a web app with a harmonized burning-activity calendar from NASA FIRMS MODIS + VIIRS hotspots,
so users can see historical fire patterns, anomalies and critical periods for an area they choose.

## Goal

A prototype that turns historical FIRMS fire detections (MODIS + VIIRS) into comparable, useful information to explore:

1. where and when fire activity happened;
2. how seasonality varies by region;
3. which periods show abnormal activity;
4. how the current month compares with the historical median for the selected area.

## Minimum viable scope

- A historical period from the early 2000s to the present, processed for at least one pilot area (the app lets users pick an area within it).
- MODIS and VIIRS harmonized into a common unit of analysis.
- A web app: select an area (draw on map or enter lat/lon) and a date range; see the burning calendar (month × year) with an accessible color ramp; download hotspots as CSV.
- Trends and anomalies against the multi-year median/average.
- Enough documentation to reproduce the demo.

## Stretch goals (only after Checkpoint 3)

- Critical-period prediction PoC with temporal validation (plan v1 Block 3.2). Not asked for by the brief.
- Weather or land-cover context layers.

## Out of scope

- Global coverage with production performance.
- Causal claims or exact prediction of individual fires.
- An official alert or emergency-support system.
- Replacing scientific or operational validation by competent agencies.

## Architecture

```text
NASA FIRMS (MODIS + VIIRS)
          │
          ▼
Collection, cleaning, provenance          ── Block 1
          │
          ▼
Spatio-temporal harmonization + overlap validation
          │
          ├────────────────────┐
          ▼                    ▼
Historical calendar      Weather / environment
and visualizations       (optional in the PoC)
  ── Block 2                   │
          │                    │
          └─────────┬──────────┘
                    ▼
       Anomalies + critical periods     ── Block 3
                    │
                    ▼
     App, documentation, presentation
```

## The three blocks

| Block | Goal | Time budget | Detail |
|-------|------|-------------|--------|
| 1. Harmonization | Comparable MODIS/VIIRS dataset with provenance | Team Harmonization, H0–H8 | [blocks/01-harmonization.md](blocks/01-harmonization.md) |
| 2. Web app and calendar | Area + date selection, burning calendar, trends, downloads | Team Dashboard, H0–H14 | [blocks/02-historical-calendar.md](blocks/02-historical-calendar.md) |
| 3. Anomalies (core) and prediction (stretch) | Anomalies vs historical median; prediction only if time allows | Both, H8–H26 | [blocks/03-anomalies-prediction.md](blocks/03-anomalies-prediction.md) |

Blocks run in parallel: Dashboard builds on a sample file while Harmonization produces the real data. Schedule and checkpoints (H8, H14, H26, freeze H30): [timeline.md](timeline.md).

## Hand-off contracts between blocks

| From | To | What must be handed over |
|------|----|--------------------------|
| First-hour decisions | Block 1 | Region, period, spatial and temporal unit defined |
| Block 1 | Block 2 | Versioned dataset, data dictionary, stable metrics |
| Block 1 | Block 3 | Leak-free historical series; coverage and limitations documented |
| Weather / environment data | Block 3 | Aligned variables, verified units, reproducible queries |
| Blocks 2 and 3 | Presentation | Stable URLs/artifacts, pre-selected examples, offline mode |

## Scientific guardrails

These apply to everyone, including AI coding agents:

- MODIS (~1 km) and VIIRS (375 m) are **different instruments**. Never treat raw counts as equivalent.
- Every processed row keeps `sensor`, `product` and time reference. Provenance is never dropped.
- An active-fire detection is **not** burned area, a fire count, or impact.
- Train/validation/test splits are **chronological**. No future information in features.
- Any model is compared to a simple baseline (seasonal climatology or persistence).
- Language in the app and pitch: "risk", "probability", "critical period". Never promise a fire will happen.
- The map must not suggest more spatial precision than the data has.

## Definition of done

- [ ] The demo answers one clear, relevant question.
- [ ] The data pipeline is reproducible and keeps provenance.
- [ ] MODIS and VIIRS are not naively compared as identical sensors.
- [ ] Map, calendar, trends and filters work with real data.
- [ ] Anomalies use a documented seasonal baseline.
- [ ] The prediction stretch goal, if shown, uses a temporal test split and a baseline.
- [ ] Limitations and uncertainty appear in both the app and the presentation.
- [ ] Sources, credits and licenses are recorded in [resources.md](resources.md).
- [ ] Official requirements verified by one person and reviewed by another ([challenge/official-requirements.md](challenge/official-requirements.md)).
- [ ] Offline demo, screenshots and a copy of all final artifacts exist.
- [ ] At least two timed rehearsals done.
- [ ] Demo is a ≤ 30 s video or ≤ 7 slides, in English (or with English subtitles).
- [ ] AI use is acknowledged as the rules require.
- [ ] Submission sent and confirmation saved by Sun 22:30 local (deadline 23:59).

## Pitch outline

1. **Problem:** fire histories from different sensors can't be compared without care.
2. **Method:** we harmonize space, time, quality and provenance, and validate on the overlap period.
3. **Experience:** map, timeline, regional calendar and trends make patterns explorable.
4. **Insight:** anomalies against the historical median highlight unusual months and critical periods.
5. **Impact:** helps ask better questions and prioritize analysis, without replacing official alerts or experts.
6. **Transparency:** we show uncertainty, sensor differences, limitations and next validation steps.

## Disclaimer

This prototype is exploratory. Fire detections and risk estimates carry uncertainty and must not be used on their
own for emergency, public-safety or resource-allocation decisions.
