# ACE Desktop Setup Guide

This guide helps new users run and package `ace-desktop` from a fresh clone.

## 1) Prerequisites

- macOS (Apple Silicon recommended)
- Node.js + npm
- `uv` installed and available in `PATH`
- A local copy of:
  - `ACE-Step-1.5`
  - `ace-step-ui`

## 2) Folder layout

By default, `ace-desktop` expects sibling folders:

```text
workspace/
  ACE-Step-1.5/
  ace-step-ui/
  ace-desktop/
```

If your layout differs, copy `.env.example` to `.env` and set overrides:

- `ACE_WORKSPACE_ROOT`
- `ACESTEP_DIR`
- `ACE_STEP_UI_DIR`

## 3) Install dependencies

```bash
cd ace-desktop
npm install
```

## 4) Run in development

```bash
npm run dev
```

This opens a native Electron window and starts:

- ACE API on `8001`
- UI backend on `3001`
- UI frontend on `3000`

## 5) Build macOS app

```bash
npm run build:mac
```

Artifacts are produced in `dist/`:

- `.app` bundle (inside `dist/mac-arm64/`)
- `.dmg`
- `.zip`

## 6) Troubleshooting

- **Port already in use**: stop conflicting processes or change `ACE_*_PORT` variables.
- **Missing command**: install required tool (`uv`, `node`, or `npm`) and retry.
- **Startup failure**: check logs in `ace-desktop/logs/`.
- **Stale process state**: remove `ace-desktop/run/*.pid` and restart.

## 7) Maintainer release checklist

Use this flow to publish a downloadable app release:

1. Ensure `ace-desktop/package.json` has the intended version.
2. Commit and push all release-related changes to `main`.
3. Create a tag matching the release workflow pattern, for example:
   - `git tag v1.0.1`
   - `git push origin v1.0.1`
4. Wait for the `Release ACE Desktop` workflow to finish on GitHub Actions.
5. Open the generated GitHub Release and confirm `.dmg` and `.zip` assets are attached.
