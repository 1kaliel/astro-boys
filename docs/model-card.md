# Model card: critical-period PoC

Owner: Person 6, reviewed by Person 5. Fill in before the H28 checkpoint.

## Status

**Experimental proof of concept. Not an operational alert.**

## Target

_Plain-language definition, e.g. "next week's detections in a region exceed that region's 90th percentile"._

- Region / unit: _TBD_
- Horizon: _TBD_
- Positive class rate in the training data: _TBD_

## Data

- Training period: _TBD_ · Validation: _TBD_ · Test: _TBD_ (chronological split)
- Features (all available at forecast time): _TBD_

## Baseline

_Seasonal climatology or persistence; how it's computed._

## Model

_Type, key settings, why this one._

## Results (test set)

| Model | Metric 1 | Metric 2 | Notes |
|-------|----------|----------|-------|
| Baseline | | | |
| Model | | | |

Per-region / per-class results: _link_.

## Example hit and miss

_One correct and one wrong prediction, with a short explanation._

## Intended use

Exploring when a region may enter a critical fire period, to prioritize further analysis.

## Not intended for

Emergency response, public-safety decisions, resource allocation, or predicting individual fires.

## Known limitations and risks

- _Why the model may fail._
- Sensor coverage and cloud bias propagate into labels.
- _Add as found._
