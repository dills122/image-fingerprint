#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
ai_central_home=${AI_CENTRAL_HOME:-"$repo_root/../ai-central"}
installer="$ai_central_home/scripts/setup-ai-context.sh"

if [ ! -x "$installer" ]; then
  echo "AI Central installer not found: $installer" >&2
  echo "Set AI_CENTRAL_HOME to the ai-central repository root." >&2
  exit 1
fi

exec "$installer" "$repo_root" \
  --yes \
  --mode link \
  --profiles base,javascript-typescript \
  --bundles core,planning,workflow
