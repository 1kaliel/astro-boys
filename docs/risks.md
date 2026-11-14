# Risks and contingency plans

Review at every checkpoint (H6, H14, H28, H38). When a risk fires, log a `BLOCKER` in the diary.

| Risk | Warning sign | Response | Owner |
|------|--------------|----------|-------|
| FIRMS download or API unavailable | Repeated failures at H1–H2 | Use a pre-downloaded sample, record its period, continue offline | Person 2 |
| FIRMS archive request slow to arrive | Request not delivered within hours | Request before H0 if rules allow; fall back to the API's short windows for a smaller period | Person 2 |
| Strong disagreement between sensors | Unstable ratios, low agreement | Show sensors separately; limit aggregated comparisons | Person 3 |
| Geographic scope too large | Pipeline doesn't finish by H4 | Shrink region and/or period immediately | Person 3 |
| Meteomatics quota | Fast consumption | Cache responses, limit points/times, prioritize variables | Person 6 |
| Weak prediction | Doesn't beat baseline at H28 | Turn into exploratory analysis; no predictive claim | Person 5 |
| Unstable app | Network/publishing failure | Run locally; use backup video and screenshots | Person 4 |
| Missing official requirement | Doubt after H38 | Person 1 checks the official source before final freeze | Person 1 |
| Temporal leakage | Unrealistically good metrics | Redo chronological split; audit features | Person 5 |
| Sensor coverage gaps | Trend jumps when a sensor starts or ends | Mark sensor periods on every time chart; avoid cross-sensor trend claims | Person 5 |
| Cloud trial needs a card / isn't eligible | Signup blocked | Stay local; credits are never a technical requirement | Person 6 |
