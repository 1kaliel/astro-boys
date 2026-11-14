# Risks and contingency plans

Review at every checkpoint (H8, H14, H26, H30). When a risk fires, log a `BLOCKER` in the diary.

| Risk | Warning sign | Response | Owner |
|------|--------------|----------|-------|
| FIRMS download or API unavailable | Repeated failures in the first hours | Use a pre-downloaded sample, record its period, continue offline | Harmonization |
| FIRMS archive request slow to arrive | Not delivered within an hour or two | Use the fast paths in [data-access.md](data-access.md); shrink area/period | Harmonization |
| Strong disagreement between sensors | Unstable ratios, low agreement | Show sensors separately; limit aggregated comparisons | Harmonization |
| Geographic scope too large | Pipeline doesn't finish by H4 | Shrink region and/or period immediately | Harmonization |
| Weak prediction | Doesn't beat baseline at H26 (stretch goal) | Turn into exploratory analysis; no predictive claim | Harmonization |
| Unstable app | Network/publishing failure | Run locally; use backup video and screenshots | Dashboard |
| Missing official requirement | Doubt near the feature freeze (H30) | Submission owner rechecks the official guides | Submission owner |
| Temporal leakage | Unrealistically good metrics | Redo chronological split; audit features | Harmonization |
| Sensor coverage gaps | Trend jumps when a sensor starts or ends | Mark sensor periods on every time chart; avoid cross-sensor trend claims | Harmonization |
| Cloud trial needs a card / isn't eligible | Signup blocked | Use a free static host or run locally; credits are never a requirement | Dashboard |
| Deadline missed | Anything unfinished at Sun 19:00 | Feature freeze is Sun 15:00; submit by 22:30; deadline is 23:59 local | Submission owner |
| Not eligible for global judging | Member not on same Local Event; demo over 30 s / 7 slides; non-English materials | Check [challenge/official-requirements.md](challenge/official-requirements.md) early | Submission owner |
| AI-use rules | AI-made code or data not acknowledged | Record AI use as it happens in [resources.md](resources.md#ai-usage) | Everyone |
