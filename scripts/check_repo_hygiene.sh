#!/usr/bin/env bash
# Fail if the repo tracks (or is about to commit) secrets, .env files, credentials, raw/large data.
# Runs in CI and locally: ./scripts/check_repo_hygiene.sh  (checks tracked + staged files)
set -euo pipefail
cd "$(dirname "$0")/.."

MAX_KB="${MAX_FILE_KB:-5120}"          # any tracked file
FIXTURE_MAX_KB="${FIXTURE_MAX_KB:-100}" # tests/fixtures
fail=0
report() { echo "✗ $1"; shift; printf '    %s\n' "$@"; fail=1; }

mapfile -t files < <(git ls-files --cached | sort -u)

# 1. Environment files (templates ending in .example are fine)
mapfile -t envs < <(printf '%s\n' "${files[@]}" | grep -E '(^|/)\.env($|\.)|\.env$' | grep -vE '\.example$' || true)
[[ ${#envs[@]} -eq 0 ]] || report ".env files must not be committed" "${envs[@]}"

# 2. Credential files
mapfile -t creds < <(printf '%s\n' "${files[@]}" | grep -iE '\.(pem|p12|pfx|key)$|(^|/)(credentials|service-account)[^/]*\.json$|application_default_credentials\.json$' || true)
[[ ${#creds[@]} -eq 0 ]] || report "credential files must not be committed" "${creds[@]}"

# 3. Secret-looking content (gitleaks in CI does a deeper scan)
patterns='-----BEGIN [A-Z ]*PRIVATE KEY-----|"type": *"service_account"|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[0-9A-Za-z]{30,}|FIRMS_MAP_KEY=[0-9a-fA-F]{16,}|METEOMATICS_PASSWORD=[^[:space:]]+'
mapfile -t leaks < <(git grep -lIE "$patterns" -- . ':!scripts/check_repo_hygiene.sh' 2>/dev/null || true)
[[ ${#leaks[@]} -eq 0 ]] || report "possible secrets in tracked files" "${leaks[@]}"

# 4. Data files: under data/ only docs and placeholders; data formats nowhere (fixtures excepted)
mapfile -t datadir < <(printf '%s\n' "${files[@]}" | grep -E '^data/' | grep -vE '^data/(README\.md|raw/SOURCES\.md)$|/\.gitkeep$' || true)
[[ ${#datadir[@]} -eq 0 ]] || report "data files must not be committed under data/ (use the bucket / Drive)" "${datadir[@]}"
mapfile -t dataext < <(printf '%s\n' "${files[@]}" | grep -iE '\.(parquet|geoparquet|zip|gz|tar|7z|gpkg|shp|shx|dbf|nc|hdf|h5|he5|tif|tiff|duckdb|db|sqlite|feather|arrow|csv|tsv)$' | grep -vE '^tests/fixtures/' || true)
[[ ${#dataext[@]} -eq 0 ]] || report "data-format files outside tests/fixtures" "${dataext[@]}"

# 5. File sizes
big=()
for f in "${files[@]}"; do
  [[ -f "$f" ]] || continue
  kb=$(( $(stat -c %s "$f") / 1024 ))
  limit=$MAX_KB; [[ "$f" == tests/fixtures/* ]] && limit=$FIXTURE_MAX_KB
  (( kb > limit )) && big+=("$f (${kb} KB > ${limit} KB)")
done
[[ ${#big[@]} -eq 0 ]] || report "files too large" "${big[@]}"

if [[ $fail -eq 0 ]]; then
  echo "✓ repo hygiene: ${#files[@]} files checked, no secrets, .env, credentials or data"
fi
exit $fail
