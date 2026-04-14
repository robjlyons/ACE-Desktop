#!/usr/bin/env bash

set -euo pipefail

LAUNCHER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACE_ROOT="/Users/rob/Documents/ACE"
ACESTEP_DIR="$ACE_ROOT/ACE-Step-1.5"
UI_DIR="$ACE_ROOT/ace-step-ui"
UI_SERVER_DIR="$UI_DIR/server"

LOG_DIR="$LAUNCHER_DIR/logs"
RUN_DIR="$LAUNCHER_DIR/run"

API_PORT=8001
BACKEND_PORT=3001
FRONTEND_PORT=3000

API_URL="http://127.0.0.1:${API_PORT}/health"
APP_URL="http://127.0.0.1:${FRONTEND_PORT}"

mkdir -p "$LOG_DIR" "$RUN_DIR"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing command: $cmd"
    exit 1
  fi
}

ensure_dir() {
  local path="$1"
  if [[ ! -d "$path" ]]; then
    echo "Missing directory: $path"
    exit 1
  fi
}

is_pid_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(<"$pid_file")"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

wait_for_tcp_port() {
  local port="$1"
  local label="$2"
  local timeout_s="${3:-120}"
  local start
  start="$(date +%s)"
  while true; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    if (( "$(date +%s)" - start > timeout_s )); then
      echo "Timeout waiting for $label on port $port."
      return 1
    fi
    sleep 1
  done
}

wait_for_http_url() {
  local url="$1"
  local label="$2"
  local timeout_s="${3:-240}"
  local start
  start="$(date +%s)"
  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    if (( "$(date +%s)" - start > timeout_s )); then
      echo "Timeout waiting for $label at $url."
      return 1
    fi
    sleep 2
  done
}

is_port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

fail_if_port_busy() {
  local port="$1"
  local service_name="$2"
  if is_port_listening "$port"; then
    echo "Port $port is already in use, cannot start $service_name."
    echo "Stop the conflicting process or change the launcher port."
    exit 1
  fi
}

cleanup_stale_pid() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]] && ! is_pid_running "$pid_file"; then
    rm -f "$pid_file"
  fi
}

echo "ACE Launcher start sequence..."

require_cmd uv
require_cmd node
require_cmd npm
require_cmd curl
require_cmd lsof

ensure_dir "$ACESTEP_DIR"
ensure_dir "$UI_DIR"
ensure_dir "$UI_SERVER_DIR"

API_PID_FILE="$RUN_DIR/api.pid"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

cleanup_stale_pid "$API_PID_FILE"
cleanup_stale_pid "$BACKEND_PID_FILE"
cleanup_stale_pid "$FRONTEND_PID_FILE"

if is_pid_running "$API_PID_FILE" && is_pid_running "$BACKEND_PID_FILE" && is_pid_running "$FRONTEND_PID_FILE"; then
  echo "Services already running. Opening app URL..."
  open "$APP_URL"
  exit 0
fi

fail_if_port_busy "$API_PORT" "ACE-Step API"
fail_if_port_busy "$BACKEND_PORT" "UI backend"
fail_if_port_busy "$FRONTEND_PORT" "UI frontend"

echo "Starting ACE-Step API on :$API_PORT ..."
(
  cd "$ACESTEP_DIR"
  ACESTEP_LM_BACKEND=mlx TOKENIZERS_PARALLELISM=false uv run acestep-api --host 127.0.0.1 --port "$API_PORT"
) >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!
echo "$API_PID" >"$API_PID_FILE"

echo "Starting UI backend on :$BACKEND_PORT ..."
(
  cd "$UI_SERVER_DIR"
  npm run build
  PORT="$BACKEND_PORT" ACESTEP_API_URL="http://127.0.0.1:${API_PORT}" npm run start
) >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" >"$BACKEND_PID_FILE"

echo "Starting UI frontend on :$FRONTEND_PORT ..."
(
  cd "$UI_DIR"
  npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort
) >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" >"$FRONTEND_PID_FILE"

echo "Waiting for services to become healthy..."
wait_for_http_url "$API_URL" "ACE API" 360 || {
  "$LAUNCHER_DIR/stop.sh" >/dev/null 2>&1 || true
  exit 1
}
wait_for_tcp_port "$BACKEND_PORT" "UI backend" 120 || {
  "$LAUNCHER_DIR/stop.sh" >/dev/null 2>&1 || true
  exit 1
}
wait_for_tcp_port "$FRONTEND_PORT" "UI frontend" 120 || {
  "$LAUNCHER_DIR/stop.sh" >/dev/null 2>&1 || true
  exit 1
}

echo "All services healthy."
echo "Opening $APP_URL"
open "$APP_URL"
echo "Done. Logs: $LOG_DIR"
