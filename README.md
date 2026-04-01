# CodexRemote

CodexRemote is a local-first web companion for Codex sessions and workspace browsing.

Current local baseline:

- local bridge API with a fixture Codex adapter
- SQLite-backed persistent project registry shared by browsers on the same host
- Vite web shell on port `5280`
- bridge API on port `3180`
- project selector and add-project flow
- session and thread browsing
- explorer-style workspace tree
- Monaco-based file editor for supported text files
- save-to-disk support inside the workspace root
- markdown preview with source toggle
- in-app PowerShell terminal backed by `node-pty` and `xterm`
- compact Zen mode for phone-sized browsers
- optional browser IDE launch button via `VITE_BROWSER_IDE_URL`
- Git panel with status badges, branch switching, branch creation, stage-all, and commit workflow
- resizable conversation/workspace split and resizable explorer/editor split
- collapsible explorer and terminal rails
- compact Zen mode verified against the current workspace layout path

## Run locally

```bash
npm install
npm run dev
```

Expected local addresses:

- web UI on this machine: `http://127.0.0.1:5280`
- web UI from other devices on your local network: `http://<your-host-ip>:5280`
- bridge API: `http://127.0.0.1:3180`

Network note:

- Vite now listens on `0.0.0.0` so the UI is reachable on your local network.
- The bridge API remains local to the host machine and is reached from browsers through the Vite proxy.

Optional browser IDE integration:

- set `VITE_BROWSER_IDE_URL` to expose a `Launch VS Code` link in the header

## Verification

```bash
npm test
npm run build
```

Runtime smoke check already verified:

- bridge boot on `3180`
- `GET /api/health`

## Current limitations

- real Codex app-server integration is not wired yet; the bridge is still fixture-backed
- this specific `CodexRemote` workspace is not a Git repository, so Git actions here will correctly show the non-repo fallback state
- prompt send is not implemented yet
- bundle size is currently large because Monaco is loaded in the main client build
