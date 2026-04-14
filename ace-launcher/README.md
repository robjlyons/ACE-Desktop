# ACE Launcher

Single-click local launcher for ACE-Step API + ACE UI on macOS.

## What it starts

- ACE-Step API on `127.0.0.1:8001`
- UI backend on `127.0.0.1:3001`
- UI frontend on `127.0.0.1:3000`

## Scripts

- `start.sh`: Starts all services, waits for health, opens the app URL.
- `stop.sh`: Stops all tracked services using PID files.
- `check-health.sh`: Verifies API and UI ports are healthy.
- `create-app.sh`: Creates clickable `.app` launchers in `/Applications`.

## Logs and runtime state

- Logs: `ace-launcher/logs/`
- PID files: `ace-launcher/run/`

## Install the clickable app

From `ace-launcher`:

```bash
chmod +x start.sh stop.sh check-health.sh create-app.sh
./create-app.sh
```

This creates:

- `/Applications/ACE Launcher.app`
- `/Applications/ACE Launcher Stop.app`

## Recovery

- If services appear stuck, run `./stop.sh`.
- If PID files are stale, `start.sh` cleans stale entries automatically.
- If ports are busy from external processes, stop those processes or change ports in scripts.
