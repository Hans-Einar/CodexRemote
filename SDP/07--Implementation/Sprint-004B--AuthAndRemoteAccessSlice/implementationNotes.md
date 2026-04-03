# Implementation Notes

## Auth Baseline (2026-04-02)

Completed work:

- added auth configuration handling with opt-in required mode
- added SQLite-backed auth users, sessions, and OAuth state storage
- added Google OAuth start and callback endpoints for CodexRemote itself
- added protected API access in required-auth mode
- added terminal websocket protection in required-auth mode
- added a login gate and a basic admin access-management UI in the browser shell

## Verification

- `npm test`
- `npm run build`
