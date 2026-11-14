#!/usr/bin/env bash
# Append a timestamped entry to today's diary (docs/diary/YYYY-MM-DD.md, UTC).
#
# Usage:
#   ./scripts/log.sh <type> "<summary>" ["<details / why / alternatives>"]
#
# Types: decision | done | blocker | idea | meeting | note
# Author defaults to `git config user.name`; override with LOG_AUTHOR="name".
set -euo pipefail

TYPES="decision done blocker idea meeting note"

usage() {
  echo "Usage: $0 <type> \"<summary>\" [\"<details>\"]" >&2
  echo "Types: $TYPES" >&2
  exit 1
}

[[ $# -lt 2 ]] && usage

type_lc=$(echo "$1" | tr '[:upper:]' '[:lower:]')
[[ " $TYPES " == *" $type_lc "* ]] || { echo "Unknown type: $1" >&2; usage; }
type_uc=$(echo "$type_lc" | tr '[:lower:]' '[:upper:]')
summary=$2
details=${3:-}

repo_root=$(cd "$(dirname "$0")/.." && pwd)
day=$(date -u +%Y-%m-%d)
time=$(date -u +%H:%M)
author=${LOG_AUTHOR:-$(git -C "$repo_root" config user.name 2>/dev/null || echo "${USER:-unknown}")}
file="$repo_root/docs/diary/$day.md"

if [[ ! -f "$file" ]]; then
  printf '# Diary: %s\n' "$day" > "$file"
fi

{
  printf '\n## %s UTC · %s · %s\n\n' "$time" "$type_uc" "$author"
  printf '%s\n' "$summary"
  if [[ -n "$details" ]]; then
    printf '\n%s\n' "$details"
  elif [[ "$type_uc" == "DECISION" ]]; then
    printf '\n> TODO: add **why** and **alternatives rejected**.\n'
  fi
} >> "$file"

echo "Logged $type_uc to docs/diary/$day.md"
