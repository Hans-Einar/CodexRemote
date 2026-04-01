# Implementation Notes

## Partial Baseline Work (2026-04-01)

Completed work in this sprint slice:

- implemented markdown preview rendering in the web shell
- added preview-state handling for markdown versus plain-text files
- added Monaco-based editing for supported text files
- added save-to-disk support through the bridge for supported workspace files
- added dirty-state and saved-state feedback in the shell
- added markdown preview-first behavior with a source toggle
- added a compact Zen mode that switches between agent and workspace surfaces on phone-sized layouts
- added an optional browser IDE launch link driven by `VITE_BROWSER_IDE_URL`

Not completed in this slice:

- prompt send
- assistant pending-state handling
- conversation compose UI

## Verification

- `npm test`
- `npm run build`
- runtime smoke check against `GET /api/health`
