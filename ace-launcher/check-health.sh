#!/usr/bin/env bash

set -euo pipefail

API_URL="http://127.0.0.1:8001/health"
BACKEND_PORT=3001
FRONTEND_PORT=3000

check_tcp() {
  local port="$1"
  local name="$2"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[ok] $name on port $port"
  else
    echo "[fail] $name not listening on port $port"
    return 1
  fi
}

check_http() {
  local url="$1"
  local name="$2"
  if curl -fsS "$url" >/dev/null 2>&1; then
    echo "[ok] $name at $url"
  else
    echo "[fail] $name not healthy at $url"
    return 1
  fi
}

check_http "$API_URL" "ACE API"
check_tcp "$BACKEND_PORT" "UI backend"
check_tcp "$FRONTEND_PORT" "UI frontend"

echo "All health checks passed."
