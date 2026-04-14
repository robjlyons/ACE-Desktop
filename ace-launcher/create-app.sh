#!/usr/bin/env bash

set -euo pipefail

LAUNCHER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_START_NAME="ACE Launcher"
APP_STOP_NAME="ACE Launcher Stop"

START_APP_PATH="/Applications/${APP_START_NAME}.app"
STOP_APP_PATH="/Applications/${APP_STOP_NAME}.app"

if ! command -v osacompile >/dev/null 2>&1; then
  echo "osacompile is required on macOS."
  exit 1
fi

START_SCRIPT="$LAUNCHER_DIR/start.sh"
STOP_SCRIPT="$LAUNCHER_DIR/stop.sh"

if [[ ! -x "$START_SCRIPT" ]]; then
  echo "Missing executable start script: $START_SCRIPT"
  exit 1
fi

if [[ ! -x "$STOP_SCRIPT" ]]; then
  echo "Missing executable stop script: $STOP_SCRIPT"
  exit 1
fi

tmp_start="$(mktemp)"
tmp_stop="$(mktemp)"

cat >"$tmp_start" <<EOF
do shell script "bash '$START_SCRIPT' > '$LAUNCHER_DIR/logs/app-start.log' 2>&1 &"
display notification "ACE Launcher started" with title "ACE Launcher"
EOF

cat >"$tmp_stop" <<EOF
do shell script "bash '$STOP_SCRIPT' > '$LAUNCHER_DIR/logs/app-stop.log' 2>&1"
display notification "ACE Launcher stopped" with title "ACE Launcher"
EOF

rm -rf "$START_APP_PATH" "$STOP_APP_PATH"

osacompile -o "$START_APP_PATH" "$tmp_start"
osacompile -o "$STOP_APP_PATH" "$tmp_stop"

rm -f "$tmp_start" "$tmp_stop"

echo "Created apps:"
echo "  $START_APP_PATH"
echo "  $STOP_APP_PATH"
