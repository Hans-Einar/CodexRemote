# Implementation Notes

## First Boot Baseline (2026-04-01)

Completed work:

- reserved Vite dev port `5280`
- reserved bridge API port `3180`
- created the first local bridge process entry point
- added the bridge health endpoint and mode endpoint
- defined shared adapter, session, thread, and workspace contracts
- implemented a fixture Codex adapter for first-boot development and test coverage

Notes:

- live local Codex discovery is still deferred
- the current adapter is intentionally fixture-backed so the first boot can be developed and verified without undocumented protocol dependence

## Verification

- `npm test`
- `npm run build`
