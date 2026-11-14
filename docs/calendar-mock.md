# Calendar v1 mock for dashboard development

From the repository root:

```bash
uv sync --locked
uv run python scripts/calendar_mock.py
```

Read `data/interim/calendar-mock/calendar.parquet` with DuckDB. Use `--output`
to write to a different location. This mock uses the
[calendar v1 columns](data-dictionary.md#1-processedcalendarv1--the-dashboards-main-table)
in a single file. Production data is partitioned by year.

The sample includes two adjacent L2 cells in Northeast Brazil, every month
from 2003 through 2025, and periods `D`, `N`, and `ALL`. Select one period at a
time. January 2012 is labeled estimated and February 2012 is labeled observed
to exercise the display transition. The sample includes intervals for
estimated rows and null raw counts before S-NPP and NOAA-20 coverage.

All values are synthetic fixtures generated with AI-assisted code. Use them
for UI and integration checks only.
