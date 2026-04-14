#!/usr/bin/env bash

set -euo pipefail

LAUNCHER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$LAUNCHER_DIR/run"

kill_descendants() {
  local parent_pid="$1"
  local child_pid
  for child_pid in $(pgrep -P "$parent_pid" || true); do
    kill_descendants "$child_pid"
    kill "$child_pid" 2>/dev/null || true
  done
}

kill_descendants_force() {
  local parent_pid="$1"
  local child_pid
  for child_pid in $(pgrep -P "$parent_pid" || true); do
    kill_descendants_force "$child_pid"
    kill -9 "$child_pid" 2>/dev/null || true
  done
}

stop_pid_file() {
  local pid_file="$1"
  local name="$2"
  if [[ ! -f "$pid_file" ]]; then
    echo "$name not tracked."
    return 0
  fi

  local pid
  pid="$(<"$pid_file")"
  if [[ -z "${pid:-}" ]]; then
    rm -f "$pid_file"
    echo "$name pid file empty, removed."
    return 0
  fi

  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name (pid $pid)..."
    kill_descendants "$pid"
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill_descendants_force "$pid"
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  else
    echo "$name already stopped."
  fi

  rm -f "$pid_file"
}

stop_pid_file "$RUN_DIR/frontend.pid" "frontend"
stop_pid_file "$RUN_DIR/backend.pid" "backend"
stop_pid_file "$RUN_DIR/api.pid" "api"

echo "Stop sequence finished."
