# Sprint 004B - Auth and Remote Access Slice

## Goal
Add host-side authentication and authorization so CodexRemote can be exposed beyond the LAN more safely.

## Scope

- Google OAuth login for CodexRemote itself
- SQLite-backed users, sessions, and allowlist state
- admin-managed allowlist UI
- protected API and terminal access
- remote-access guidance for deployment

## Exit Criteria

- auth can be enabled with environment configuration
- protected routes reject unauthenticated requests when auth mode is required
- admins can manage allowed users
- terminal websocket access is protected in required-auth mode
