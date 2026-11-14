# Data

Data files are **not** committed. Only this README, `raw/SOURCES.md` and folder placeholders are tracked.

| Folder | Contents | Rules |
|--------|----------|-------|
| `raw/` | Original downloads (FIRMS, etc.) | **Immutable.** Never edit. Log every download in `raw/SOURCES.md`. |
| `interim/` | Intermediate results | Disposable; must be regenerable from `raw/` by a script. |
| `processed/` | Harmonized, versioned datasets | Name as `<name>_v<N>.<ext>` or with the generation date. Documented in `docs/data-dictionary.md`. |

Share large files through the team's agreed storage, and keep the download scripts in `scripts/` so anyone can rebuild.
