#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime_root="${XDG_CACHE_HOME:-$HOME/.cache}/codex-runtimes/codex-primary-runtime/dependencies"
if [[ -d "$runtime_root/node/bin" ]]; then
  export PATH="$runtime_root/node/bin:$runtime_root/bin/fallback:$PATH"
fi
if [[ -z "${ATLAS_CODEX_BIN:-}" && -x /usr/lib/chatgpt/resources/codex ]]; then
  export ATLAS_CODEX_BIN=/usr/lib/chatgpt/resources/codex
fi
export ATLAS_PYTHON="${ATLAS_PYTHON:-$project_dir/.venv/bin/python3}"

cd "$project_dir"
if command -v pnpm >/dev/null 2>&1; then
  exec pnpm start "$@"
fi
exec npm start -- "$@"
