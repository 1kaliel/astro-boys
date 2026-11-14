# Project plan (v1)

> Working plan for a 6-person team, 48-hour hackathon.
> Source: [plan v1 (Portuguese original)](plan/plan-v1-original-pt.md). This is the structured English version; when they disagree, this file plus the diary win.

**Working theme:** harmonize NASA FIRMS active-fire detections from MODIS and VIIRS, build a historical
fire calendar, and flag critical periods.

**Official challenge:** not yet confirmed. See [challenge/selection.md](challenge/selection.md).

## Goal

A prototype that turns historical FIRMS fire detections (MODIS + VIIRS) into comparable, useful information to explore:

1. where and when fire activity happened;
2. how seasonality varies by region;
3. which periods show abnormal activity;
4. when conditions point to a higher chance of a critical period.

## Minimum viable scope

- One pilot region and one historical period, clearly defined.
- MODIS and VIIRS harmonized into a common unit of analysis.
- A navigable app with map, timeline and regional calendar.
- A trend and anomaly analysis.
- A predictive proof of concept with temporal validation and explicit limitations.
- Enough documentation to reproduce the demo.

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
| 1. Harmonization | Comparable MODIS/VIIRS dataset with provenance | 6 h (H0–H6) | [blocks/01-harmonization.md](blocks/01-harmonization.md) |
| 2. Historical calendar | Map + timeline + regional seasonality calendar | 8 h (H6–H14) | [blocks/02-historical-calendar.md](blocks/02-historical-calendar.md) |
| 3. Anomalies and prediction | Seasonal-baseline anomalies + critical-period PoC | 24 h (H14–H38) | [blocks/03-anomalies-prediction.md](blocks/03-anomalies-prediction.md) |

Blocks overlap in practice (anomaly baseline work starts at H6). The full schedule and checkpoints are in [timeline.md](timeline.md).

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
- [ ] The predictive PoC, if shown, uses a temporal test split and a baseline.
- [ ] Limitations and uncertainty appear in both the app and the presentation.
- [ ] Sources, credits and licenses are recorded in [resources.md](resources.md).
- [ ] Official requirements verified by one person and reviewed by another ([challenge/official-requirements.md](challenge/official-requirements.md)).
- [ ] Offline demo, screenshots and a copy of all final artifacts exist.
- [ ] At least two timed rehearsals done.
- [ ] Submission sent and confirmation saved before H48.

## Pitch outline

1. **Problem:** fire histories from different sensors can't be compared without care.
2. **Method:** we harmonize space, time, quality and provenance, and validate on the overlap period.
3. **Experience:** map, timeline, regional calendar and trends make patterns explorable.
4. **Intelligence:** anomalies highlight unusual periods; the PoC estimates critical periods and is compared to a baseline.
5. **Impact:** helps ask better questions and prioritize analysis, without replacing official alerts or experts.
6. **Transparency:** we show uncertainty, sensor differences, limitations and next validation steps.

## Disclaimer

This prototype is exploratory. Fire detections and risk estimates carry uncertainty and must not be used on their
own for emergency, public-safety or resource-allocation decisions.
