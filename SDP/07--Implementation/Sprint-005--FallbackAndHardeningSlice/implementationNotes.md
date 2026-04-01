# Implementation Notes

## Local Terminal Baseline (2026-04-01)

Completed work:

- added local terminal session management backed by `node-pty`
- selected PowerShell as the default terminal on Windows
- attached a websocket terminal endpoint at `/api/terminal`
- added an in-app terminal pane rendered with `xterm`
- kept the terminal scoped to the local workspace-root operator experience
- added Git status and workflow endpoints with graceful non-repo fallback
- added Git badges in the workspace tree and a Git panel for branch selection, branch creation, stage-all, and commit workflow
- added resizable IDE-style panel splits plus collapsible explorer and terminal rails
- verified the current workspace-panel changes against the compact Zen-mode path in UI tests

Notes:

- terminal auth and multi-session controls are not expanded yet because the app is still local-only and fixture-backed
- the current terminal is intended for trusted local use, not remote exposure

## Verification

- `npm test`
- `npm run build`
- runtime smoke check against `GET /api/health`
