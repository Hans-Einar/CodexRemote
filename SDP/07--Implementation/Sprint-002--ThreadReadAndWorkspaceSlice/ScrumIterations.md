# Scrum Iterations

## Iteration 001
- Status: planned
- Scrum meeting note:
  - Sprint 002 owns the first usable read-only CodexRemote experience.
  - This iteration is bridge-first: it establishes read APIs and workspace safety before UI wiring.
- Objective:
  - implement the read-side bridge contracts for conversations and the workspace so later UI work has stable inputs
- Entry criteria:
  - Sprint 001 has defined the bridge adapter and reserved Vite port `5280`
  - the canonical session and workspace design documents exist
- Target deliverables:
  - session, thread, and thread-history read endpoints
  - canonical session, thread, and message DTO mapping
  - workspace tree and text-file read endpoints with project-boundary enforcement
- Sprint phases touched:
  - Phase 1 - Canonical Thread Read Surface
  - Phase 2 - Workspace Boundary and Safe File Read Surface
- Detailed TODO:
  - [ ] Implement session-list reads through the bridge.
  - [ ] Implement thread-list reads through the bridge.
  - [ ] Implement thread-history reads through the bridge.
  - [ ] Map adapter payloads into canonical session DTOs.
  - [ ] Map adapter payloads into canonical thread and message DTOs.
  - [ ] Decide how read-time capability limits are surfaced to the UI.
  - [ ] Define or confirm the initial workspace root strategy.
  - [ ] Implement directory listing with normalized path handling.
  - [ ] Implement text-file read with project-boundary enforcement.
  - [ ] Define unsupported-file and oversized-file behavior for the first scope.
- Verification plan:
  - verify thread listing and history reads against the available local surface
  - verify directory listing and file reads stay inside the selected project boundary
  - verify the resulting DTOs are stable enough for UI wiring in Iteration 002
- Expected handoff-ready state:
  - Sprint 002 Iteration 002 can focus on UI integration instead of API discovery

## Iteration 002
- Status: planned
- Scrum meeting note:
  - The workspace surface is now being upgraded from a simple list into an explorer-style tree and editor baseline.
- Objective:
  - replace the custom file list with a maintained tree component and prepare the editor-aware workspace state model
- Target deliverables:
  - tree-shaped workspace data for the UI
  - a maintained explorer component wired into the shell
  - selected-file state ready for an editor pane
