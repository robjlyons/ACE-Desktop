# ACE Desktop

Electron desktop shell for ACE that starts all local services and opens an embedded window.

## Repository layout for other users

This project assumes the following sibling folders by default:

- `ACE-Step-1.5`
- `ace-step-ui`
- `ace-desktop` (this app)

Example:

```text
your-workspace/
  ACE-Step-1.5/
  ace-step-ui/
  ace-desktop/
```

You can override paths and ports with environment variables from `.env.example`.

## Run in development

```bash
cd ace-desktop
npm run dev
```

## Build macOS app

```bash
cd ace-desktop
npm run build:mac
```

Build artifacts are generated under `dist/`.

## What it starts

- ACE API: `127.0.0.1:8001`
- UI backend: `127.0.0.1:3001`
- UI frontend: `127.0.0.1:3000`

## Logs and runtime state

- Logs: `ace-desktop/logs/`
- PID files: `ace-desktop/run/`

## GitHub-ready notes

- Commit this `ace-desktop` folder as the app repo.
- Keep `node_modules`, `dist`, `logs`, and `run` out of git via `.gitignore`.
- Include installation notes that users must also clone `ACE-Step-1.5` and `ace-step-ui`.
- For a step-by-step install and build flow, see `SETUP.md`.
