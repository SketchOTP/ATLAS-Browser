#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ "${1:-}" == -- ]]; then shift; fi
app_path="${ATLAS_SMOKE_APP:-${1:-$project_dir/release/linux-unpacked/atlas}}"
test -x "$app_path"

smoke_root=$(mktemp -d)
smoke_port="${ATLAS_SMOKE_PORT:-$((49000 + RANDOM % 500))}"
smoke_pid=''

cleanup() {
  mapfile -t profile_pids < <(pgrep -f -- "$smoke_root/profile" 2>/dev/null || true)
  if ((${#profile_pids[@]})); then kill -TERM "${profile_pids[@]}" 2>/dev/null || true; fi
  if [[ -n "$smoke_pid" ]]; then kill -TERM -- "-$smoke_pid" 2>/dev/null || true; fi
  for _attempt in $(seq 1 40); do
    mapfile -t profile_pids < <(pgrep -f -- "$smoke_root/profile" 2>/dev/null || true)
    ((${#profile_pids[@]} == 0)) && break
    sleep 0.1
  done
  if ((${#profile_pids[@]})); then kill -KILL "${profile_pids[@]}" 2>/dev/null || true; fi
  if [[ -n "$smoke_pid" ]]; then wait "$smoke_pid" 2>/dev/null || true; fi
  for _attempt in $(seq 1 20); do
    rm -rf -- "$smoke_root" 2>/dev/null || true
    [[ ! -e "$smoke_root" ]] && return
    sleep 0.1
  done
  echo "Could not remove isolated smoke directory: $smoke_root" >&2
}
trap cleanup EXIT

smoke_env=(
  ATLAS_USER_DATA_DIR="$smoke_root/profile"
  ATLAS_DOWNLOADS_DIR="$smoke_root/downloads"
  ATLAS_BROWSER_PORT="$smoke_port"
  ATLAS_CODEX_BIN=/bin/false
)
if [[ "$app_path" == *.AppImage ]]; then
  smoke_env+=(APPIMAGE_EXTRACT_AND_RUN=1)
fi

setsid env "${smoke_env[@]}" \
  "$app_path" --no-sandbox >"$smoke_root/atlas.log" 2>&1 &
smoke_pid=$!

for _attempt in $(seq 1 60); do
  shell_ready=false
  window_ready=false
  if curl --fail --silent "http://localhost:$smoke_port/" | grep --quiet '<title>ATLAS</title>'; then shell_ready=true; fi
  if grep --quiet 'MAIN_WINDOW_READY' "$smoke_root/profile/runtime-events.log" 2>/dev/null; then window_ready=true; fi
  if [[ "$shell_ready" == true && "$window_ready" == true ]]; then
    echo 'Packaged ATLAS smoke test passed: isolated shell and Electron window are ready.'
    exit 0
  fi
  if ! kill -0 "$smoke_pid" 2>/dev/null; then
    sed -n '1,240p' "$smoke_root/atlas.log"
    exit 1
  fi
  sleep 0.5
done

sed -n '1,240p' "$smoke_root/atlas.log"
echo 'Packaged ATLAS did not become ready in time.' >&2
exit 1
