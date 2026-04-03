# Enable Google Auth For CodexRemote

This document explains how to enable Google OAuth login for CodexRemote itself.

## Purpose

Google OAuth here protects the CodexRemote web app.

It does **not** log the user into OpenAI or Codex on their behalf.

## Required environment variables

Set these on the host that runs CodexRemote:

```bash
CODEXREMOTE_AUTH_MODE=required
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=https://your-domain.example/api/auth/google/callback
CODEXREMOTE_BOOTSTRAP_ADMIN_EMAILS=you@example.com,another-admin@example.com
```

## Google Cloud setup

1. Create a Google OAuth web application in Google Cloud.
2. Add the exact redirect URI you plan to use, for example:
   `https://your-domain.example/api/auth/google/callback`
3. Copy the generated client id and client secret into the environment variables above.

## Bootstrap behavior

- users listed in `CODEXREMOTE_BOOTSTRAP_ADMIN_EMAILS` become allowed admins on first login
- users not allowlisted will authenticate successfully with Google but still be blocked from CodexRemote until an admin allows them

## Operational notes

- API routes and terminal websocket access are protected only when `CODEXREMOTE_AUTH_MODE=required`
- if auth mode is not required, CodexRemote keeps the current development-friendly local behavior
- for remote exposure, it is still recommended to place CodexRemote behind an additional network access layer such as a VPN or zero-trust gateway
