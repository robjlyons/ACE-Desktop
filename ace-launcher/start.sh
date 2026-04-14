#!/usr/bin/env bash

set -euo pipefail

LAUNCHER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACE_ROOT="/Users/rob/Documents/ACE"
ACESTEP_DIR="$ACE_ROOT/ACE-Step-1.5"
UI_DIR="$ACE_ROOT/ace-step-ui"
UI_SERVER_DIR="$UI_DIR/server"

LOG_DIR="$LAUNCHER_DIR/logs"
RUN_DIR="$LAUNCHER_DIR/run"
MAX_LOG_BYTES="${ACE_LOG_MAX_BYTES:-52428800}"
LOG_RETENTION_DAYS="${ACE_LOG_RETENTION_DAYS:-14}"

API_PORT=8001
BACKEND_PORT=3001
FRONTEND_PORT=3000

API_URL="http://127.0.0.1:${API_PORT}/health"
APP_URL="http://127.0.0.1:${FRONTEND_PORT}"

mkdir -p "$LOG_DIR" "$RUN_DIR"

validate_positive_integer() {
  local value="$1"
  local name="$2"
  if [[ ! "$value" =~ ^[0-9]+$ ]] || [[ "$value" -le 0 ]]; then
    echo "Invalid $name: $value (must be a positive integer)"
    exit 1
  fi
}

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

capture_pid_for_port() {
  local port="$1"
  local pid_file="$2"
  local pid
  pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==1 {print $1}')"
  if [[ -n "${pid:-}" ]]; then
    echo "$pid" >"$pid_file"
  fi
}

truncate_if_oversized() {
  local file_path="$1"
  local max_bytes="$2"
  local size
  size="$(wc -c <"$file_path")"
  if [[ "$size" -gt "$max_bytes" ]]; then
    : >"$file_path"
  fi
}

prune_launcher_logs() {
  local log_dir="$1"
  local retention_days="$2"
  local max_bytes="$3"

  # Remove stale launcher logs by age.
  find "$log_dir" -type f -name "*.log" -mtime +"$retention_days" -delete 2>/dev/null || true

  # Keep active logs bounded so long sessions do not fill disk.
  local log_file
  while IFS= read -r log_file; do
    truncate_if_oversized "$log_file" "$max_bytes"
  done < <(find "$log_dir" -type f -name "*.log")
}

echo "ACE Launcher start sequence..."

require_cmd uv
require_cmd node
require_cmd npm
require_cmd curl
require_cmd lsof
require_cmd find
require_cmd wc

validate_positive_integer "$MAX_LOG_BYTES" "ACE_LOG_MAX_BYTES"
validate_positive_integer "$LOG_RETENTION_DAYS" "ACE_LOG_RETENTION_DAYS"

ensure_dir "$ACESTEP_DIR"
ensure_dir "$UI_DIR"
ensure_dir "$UI_SERVER_DIR"

prune_launcher_logs "$LOG_DIR" "$LOG_RETENTION_DAYS" "$MAX_LOG_BYTES"

API_PID_FILE="$RUN_DIR/api.pid"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

cleanup_stale_pid "$API_PID_FILE"
cleanup_stale_pid "$BACKEND_PID_FILE"
cleanup_stale_pid "$FRONTEND_PID_FILE"

if is_pid_running "$API_PID_FILE" && is_pid_running "$BACKEND_PID_FILE" && is_pid_running "$FRONTEND_PID_FILE"; then
  echo "Services already running. Opening app URL..."
  open "$APP_URL" || true
  exit 0
fi

# If all ports are already active (e.g. started outside current PID files),
# treat that as an already-running stack instead of failing on port checks.
if is_port_listening "$API_PORT" && is_port_listening "$BACKEND_PORT" && is_port_listening "$FRONTEND_PORT"; then
  if curl -fsS "$API_URL" >/dev/null 2>&1; then
    echo "Services already running on expected ports. Reusing existing processes."
    capture_pid_for_port "$API_PORT" "$API_PID_FILE"
    capture_pid_for_port "$BACKEND_PORT" "$BACKEND_PID_FILE"
    capture_pid_for_port "$FRONTEND_PORT" "$FRONTEND_PID_FILE"
    open "$APP_URL" || true
    exit 0
  fi
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
open "$APP_URL" || true
echo "Done. Logs: $LOG_DIR"
