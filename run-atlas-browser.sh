#!/usr/bin/env bash
set -euo pipefail

# Petz 4's legacy licensing helper can emit this URL in an unbounded loop.
# Reject it before starting Electron so ATLAS cannot become the amplifier.
for launch_arg in "$@"; do
  case "${launch_arg,,}" in
    http://amlocalhost.com/*|https://amlocalhost.com/*)
      exit 0
      ;;
  esac
done

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
