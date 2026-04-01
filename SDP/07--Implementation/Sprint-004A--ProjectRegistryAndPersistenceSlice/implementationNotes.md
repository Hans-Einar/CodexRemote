# Implementation Notes

## Persistent Project Registry Baseline (2026-04-02)

Completed work:

- added a SQLite-backed project registry using `node:sqlite`
- seeded the current workspace as the default initial project
- added project list and add-project APIs
- routed workspace, Git, and terminal behavior through the selected project
- updated the browser shell with a project selector and add-project form
- verified that persisted projects survive app reinitialization in tests

Notes:

- this establishes the multi-project host baseline for future real Codex adapter work
- selected project remains a per-browser UI state while the registry itself is shared across browsers on the same host

## Verification

- `npm test`
- `npm run build`
