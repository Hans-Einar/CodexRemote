# Scrum Iterations

## Iteration 001
- Status: planned
- Scrum meeting note:
  - Sprint 003 begins once the read-only bridge and UI baseline exist.
  - This iteration is contract-first so the compose UI does not grow around unclear send semantics.
- Objective:
  - define and implement the bridge-side send-message behavior and post-send conversation state model
- Entry criteria:
  - Sprint 002 provides a read-only conversation and workspace baseline
  - the bridge API surface is ready to accept a send-message path
- Target deliverables:
  - send-message bridge endpoint
  - request and response shapes for prompt send
  - explicit pending, completed, and failed assistant-state semantics
- Sprint phases touched:
  - Phase 1 - Prompt Send Contract and State Model
- Detailed TODO:
  - [ ] Implement the bridge-side send-message path.
  - [ ] Define request and response payloads for prompt send.
  - [ ] Define how send targets the currently selected thread.
  - [ ] Define post-send refresh behavior for the current supported mode set.
  - [ ] Define pending assistant-message state semantics.
  - [ ] Define completed assistant-message state semantics.
  - [ ] Define failed send and failed assistant-response semantics.
  - [ ] Record any unresolved Mode B fidelity caveats that Sprint 004 must own.
- Verification plan:
  - verify the bridge can accept a prompt-send request shape end to end
  - verify the state model is specific enough to drive compose UI work in Iteration 002
  - verify error and pending states are explicit rather than implied
- Expected handoff-ready state:
  - Sprint 003 Iteration 002 can build the compose UI without reworking send semantics

## Iteration 002
- Status: planned
- Scrum meeting note:
  - The current iteration focus is editor and preview capability before prompt send continues.
- Objective:
  - add Monaco-based editing and save behavior for supported workspace files
- Target deliverables:
  - in-app editor pane
  - save flow for supported files
  - dirty-state and save-state feedback
