# Risks and contingency plans

Review at every checkpoint (Sat 23:00, Sun 02:00, Sun 11:00, Sun 15:00). When a risk fires, log a `BLOCKER`.
Cut rules per checkpoint: [timeline.md](timeline.md#checkpoint-rules-decide-on-the-spot-log-it).

| Risk | Warning sign | Response | Owner |
|------|--------------|----------|-------|
| **No working app at the deadline** (nothing built at H9.5; two people on backend + frontend) | No calendar on screen by Sat 23:00 | Jean joins the dashboard first; one container for API + frontend; fall back to the single-Python-app option; must-haves only | Guilherme, Cleber |
| **No harmonized data in time** | No `calendar/v1` by Sun 02:00 | Ship the month × day/night ratio as v1; refine in the morning | Harmonization |
| Plan not locked; people wait | Open decisions unanswered after Sat 19:30 | Defaults in the plan apply; Kali has the final say on scope | Kali |
| Method doesn't beat baselines | Validation table at Sun 10:00 | Ship the best baseline, say so; drop stretch work | Kali |
| Teams integrate too late | App still on mock data at Sun 07:00 | Contract frozen tonight; mock has identical columns; integrate at Checkpoint B | Mateus + Guilherme |
| Pipeline too slow or out of memory | A stage runs over 30 minutes on the VM | Cut to the demo region; lower `DUCKDB_MEMORY_LIMIT`; process year by year | Mateus |
| API limits or key problem | 2026 pull not done by Sun 09:00 | Calendar ends in 2025; "current month" uses the latest complete month; say so | Justino |
| False step where satellites change | Jump at 2012, 2018 or 2026-11 in the harmonized series | One satellite per period; continuity factor for NOAA-20; chart it | Kali |
| Mixed MODIS collection versions across years | `version` table shows several values | Report it in QA and limitations; standard processing only for history | Justino |
| Sensor drift / end of S-NPP | Aqua or Terra overpass shifts; S-NPP ends 2026-11-02 | Calibrate on 2012–2019 only; NOAA-20 from 2026-11 | Kali |
| Overclaiming | "fires", "risk", "prediction" in UI or pitch | Use the guardrail wording; limitations panel; no probability language | Everyone |
| AGGS or other stretch work eats core time | Stretch started before Checkpoint C | Stretch only after a "go" at Sun 11:00 | Kali |
| Cloud Run deploy fails or URL blocked | Deploy error; URL needs login | Roll back; run the container locally and record the demo; screenshots | Guilherme, Cleber |
| Cloud overspend | Budget alert | Stop the VM; idle auto-shutdown and 12 h cap; Cloud Run max 3 instances | Kali |
| Pipeline owner lacks cloud access | Mateus can't start or SSH into the VM | Kali checks his IAM roles ([iam-and-access.md](cloud/iam-and-access.md)); meanwhile run locally on the Brazil CSVs | Kali |
| Leaked credential | CI secret scan or hygiene check fails | No key files by design; rotate the key; purge history | Everyone |
| Not eligible for global judging | Member on another Local Event; demo over 30 s / 7 slides; non-English material | Check [official-requirements.md](challenge/official-requirements.md) at the lock-in and at Sun 22:00 | Kali |
| AI-use and originality rules | AI-made code, data or images not acknowledged; outside material not listed | AI-use statement and acknowledgments; references list; no copying from other teams | Kali, Justino |
| Deadline missed | Anything unfinished at Sun 19:00 | Freeze is Sun 15:00; submit by 22:30; deadline 23:59 | Kali |
| Exhaustion | Errors, rework after 02:00 | Planned rest Sun 02:00–07:00; pair on risky changes | Everyone |
