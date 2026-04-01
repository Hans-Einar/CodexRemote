# Sprint 003 - Conversation and Preview Slice

## Goal
Add prompt send behavior, conversation updates, and markdown preview to the first usable CodexRemote experience.

## Scope

- prompt send
- optimistic or confirmed message refresh
- markdown preview
- improved conversation rendering
- optional editor handoff hooks if Sprint 002 recommends them

## Dependencies

- `SDP/06--Design/06.03--BridgeAPI.md`
- `SDP/06--Design/06.04--WorkspaceAndPreview.md`
- `SDP/06--Design/06.05--WebUI.md`
- Sprint 002 read-only baseline

## Concrete Execution Phases

### Phase 1 - Prompt Send Contract and State Model
Goal:
- make prompt send behavior explicit at the bridge and model layer before UI composition depends on it

Execution:
- implement the send-message bridge path
- define message-send request and response shapes
- define post-send refresh behavior for attached, mirrored, and fallback conditions
- define pending, completed, and failed assistant-state handling

Outputs:
- a stable send-message API
- a clear state model for post-send conversation updates

### Phase 2 - Compose Flow and Conversation Refresh
Goal:
- connect the UI to the send path and reflect new conversation state clearly

Execution:
- add the compose form and submission flow
- lock send behavior to the currently selected thread
- refresh or update the visible conversation after send
- surface send failures without losing thread context

Outputs:
- an end-to-end prompt send flow in the browser
- usable pending and failure behavior in the conversation panel

### Phase 3 - Markdown Preview Pipeline
Goal:
- upgrade file preview from plain text to markdown-aware rendering

Execution:
- render markdown client-side from sanitized content
- improve metadata display for markdown files
- handle large or unsupported preview cases explicitly
- preserve a clear boundary between bridge file-read logic and client-side rendering

Outputs:
- markdown preview support
- better preview-state handling for workspace files

### Phase 4 - Conversation UX and Editor Handoff Hooks
Goal:
- make the conversation and preview experience coherent enough for sustained use

Execution:
- improve message rendering for user, assistant, and system roles
- surface pending, completed, and failed assistant states clearly
- if Sprint 002 recommends an editor path, add non-invasive hooks such as an `open in editor` affordance without forcing embedded editing into scope

Outputs:
- a clearer conversation surface
- an extension point for later editor work if approved

### Phase 5 - Verification and Planning Hardening
Goal:
- verify that send and preview flows work together cleanly

Execution:
- verify prompt send end to end
- verify markdown preview end to end
- verify post-send refresh behavior for the currently implemented mode
- update `implementationNotes.md` with verified work only

Outputs:
- a usable send-and-preview baseline
- clear carry-over items for live updates in Sprint 004

## Non-Goals

- no strong claim of live attachment fidelity yet
- no advanced fallback management yet
- no full embedded VS Code implementation in this sprint unless later scope changes explicitly promote it

## Exit Criteria

- a user can send a prompt from the web UI
- markdown files render in preview
- the conversation view reflects post-send state clearly
- any editor handoff added remains optional and non-blocking

## Proposed Scrum Iterations

### Iteration 001 - Send API and Conversation State Rules
Focus:
- establish the bridge and model contract for sending messages before UI behavior hardens around guesses

Detailed TODO:
- [ ] Implement the send-message bridge path.
- [ ] Define request and response shapes for message send.
- [ ] Define pending, completed, and failed assistant-state semantics.
- [ ] Define the post-send refresh strategy for the current mode set.
- [ ] Record any Mode B fidelity caveats that Sprint 004 must resolve.

### Iteration 002 - Compose UI and Conversation Rendering
Focus:
- connect the send path into the browser shell and make the resulting conversation state understandable

Detailed TODO:
- [ ] Add the compose form.
- [ ] Wire prompt send to the selected thread.
- [ ] Render pending and completed assistant states.
- [ ] Surface send failures without losing the current thread context.
- [ ] Verify the end-to-end compose flow locally.

### Iteration 003 - Markdown Preview and Editor Handoff Hooks
Focus:
- complete the preview experience and leave behind a clean integration point for future editing

Detailed TODO:
- [ ] Add markdown preview rendering from sanitized file content.
- [ ] Improve file metadata and unsupported-preview states.
- [ ] Add an optional editor handoff affordance if Sprint 002 recommends one.
- [ ] Verify prompt send plus preview behavior together.
- [ ] Update `implementationNotes.md` with verified results only.
