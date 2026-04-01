# Sprint 005 - Fallback and Hardening Slice

## Goal
Finish the fallback path, tighten local safety defaults, and document the resulting operational baseline.

## Scope

- Mode A fallback management
- local error handling
- localhost-only safety defaults
- smoke verification
- documentation hardening
- final runtime and dev-configuration hardening, including the reserved non-default Vite port

## Dependencies

- `SDP/06--Design/06.01--AppServerIntegration.md`
- `SDP/06--Design/06.03--BridgeAPI.md`
- Sprint 004 attachment and live-update baseline

## Concrete Execution Phases

### Phase 1 - Fallback Thread Lifecycle Completion
Goal:
- make the Mode A fallback path explicit, usable, and operationally safe when Mode B is unavailable

Execution:
- define fallback thread creation and selection behavior
- define how fallback threads are labeled and separated from attached or mirrored work
- ensure the compose and read flows still work when the bridge cannot attach to a live external thread
- define carry-over rules between failed attach attempts and fallback thread use

Outputs:
- a complete fallback lifecycle
- clear UI separation between fallback and attached work

### Phase 2 - Runtime Safety and Configuration Hardening
Goal:
- lock in safe local defaults before treating the product baseline as stable

Execution:
- confirm localhost-only binding rules
- confirm and document the reserved Vite port `5280`
- confirm and document the bridge API port strategy
- harden error handling for startup, discovery, send, and workspace reads
- ensure configuration errors fail loudly rather than silently shifting behavior

Outputs:
- clearer local safety defaults
- stable runtime and dev-configuration rules

### Phase 3 - End-to-End Smoke Verification
Goal:
- verify the main user flows together rather than only as isolated slice features

Execution:
- verify thread discovery and thread read
- verify prompt send
- verify workspace browse and markdown preview
- verify fallback behavior when attachment is unavailable
- verify live-update or polling behavior in the currently supported mode

Outputs:
- a smoke-verified local baseline
- a list of any blocking regressions or residual risks

### Phase 4 - Documentation and Forward-Path Hardening
Goal:
- leave the repository with a durable operational baseline and a clean next-step backlog

Execution:
- update `implementationNotes.md` with verified work only
- update SDP docs where operational rules changed materially
- capture deferred items such as browser-based editor embedding as explicit follow-up work rather than implicit scope creep
- capture any release-readiness caveats that the next sprint or refactor must own

Outputs:
- durable repository memory for the completed baseline
- a clean backlog for deferred or optional work

## Non-Goals

- no new major feature area beyond the mandate
- no filesystem write features
- no embedded full IDE implementation unless a later active sprint explicitly takes ownership of it

## Exit Criteria

- fallback behavior is stable and explicit
- local safety defaults are documented and enforced
- the repository has a coherent end-to-end baseline for future iterations
- the chosen non-default Vite port is documented and treated as part of the expected local setup

## Proposed Scrum Iterations

### Iteration 001 - Fallback Lifecycle Completion
Focus:
- complete the operational path for when Mode B attach is unavailable or unsuitable

Detailed TODO:
- [ ] Define fallback thread lifecycle behavior end to end.
- [ ] Surface fallback selection and labeling clearly in the UI.
- [ ] Ensure send and read flows work in fallback mode.
- [ ] Define how failed attach attempts transition into fallback behavior.
- [ ] Record any residual ambiguity around fallback ownership.

### Iteration 002 - Runtime Safety and Config Hardening
Focus:
- lock in safe local defaults and predictable startup behavior

Detailed TODO:
- [ ] Confirm localhost-only binding as the default runtime rule.
- [ ] Confirm Vite dev port `5280` and document it in the active setup surface.
- [ ] Confirm bridge API port strategy and configuration behavior.
- [ ] Harden runtime error handling and startup diagnostics.
- [ ] Ensure configuration conflicts fail clearly.

### Iteration 003 - End-to-End Smoke and Forward-Path Capture
Focus:
- verify the whole local experience together and leave behind a clean backlog

Detailed TODO:
- [ ] Run smoke verification for read, send, preview, live-update, and fallback flows.
- [ ] Update `implementationNotes.md` with verified behavior only.
- [ ] Capture residual Mode B limitations explicitly.
- [ ] Capture browser-based editor embedding as a deferred recommendation if it remains out of scope.
- [ ] Prepare a concise next-step backlog for future sprints or refactor work.
