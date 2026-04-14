# ACE Desktop

ACE Desktop is a macOS Electron app that launches the ACE local stack and opens it in a native desktop window (no browser required).

## Download Prebuilt App

You can download ready-made builds from [GitHub Releases](https://github.com/robjlyons/ACE-Desktop/releases).

Each release includes:

- A `.zip` archive of the app bundle (`ACE Desktop.app`)
- A `.dmg` installer for macOS

Install steps:

1. Download the latest `.zip` asset from Releases.
2. Unzip it and move `ACE Desktop.app` into `Applications`.

Releases are intended to be code-signed and notarized so macOS can verify the app.

It orchestrates:

- `ACE-Step-1.5` API server
- `ace-step-ui` backend
- `ace-step-ui` frontend

with startup checks, health checks, logs, and clean shutdown.

## Requirements

- macOS (Apple Silicon recommended)
- Node.js + npm
- `uv` installed and available in your `PATH`
- Local copies of:
  - `ACE-Step-1.5`
  - `ace-step-ui`

## Expected Folder Layout

By default, this repo expects sibling folders:

```text
workspace/
  ACE-Step-1.5/
  ace-step-ui/
  ace-desktop/
```

If your layout is different, set overrides using `.env.example`.

## Install

```bash
cd ace-desktop
npm install
```

## Launch (Development)

```bash
npm run dev
```

This opens the native ACE Desktop window and starts:

- API: `127.0.0.1:8001`
- Backend: `127.0.0.1:3001`
- Frontend: `127.0.0.1:3000`

## Build the macOS App

```bash
npm run build:mac
```

Build outputs are created in `dist/` (including `.dmg` and `.zip`).

## Logs and Runtime State

- Logs: `logs/`
- PID files: `run/`
- Log rotation: each log is capped at 5 MB with one backup (`*.log.1`)
  - App runtime errors: `logs/desktop.log` and `logs/desktop.log.1`
  - Service logs: `logs/api.log`, `logs/backend.log`, `logs/frontend.log` (and matching `.log.1` backups)

## Configuration

Copy `.env.example` to `.env` and set any overrides you need:

- `ACE_WORKSPACE_ROOT`
- `ACESTEP_DIR`
- `ACE_STEP_UI_DIR`
- `ACE_API_PORT`
- `ACE_BACKEND_PORT`
- `ACE_FRONTEND_PORT`

## Troubleshooting

- Port conflict errors: stop conflicting local services or change `ACE_*_PORT`.
- Startup failures: check files under `logs/`.
- Stale processes: remove `run/*.pid` and restart.

## Additional Setup Notes

See `SETUP.md` for full first-time setup and packaging guidance.
