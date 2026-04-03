# Sprint 004 - Mode B Attachment and Live Updates Slice

## Goal
Prove or bound Mode B attachment fidelity and add live-update behavior with polling fallback.

## Scope

- attachment-state handling
- event subscribe or polling
- connection-state visibility
- degraded-mode messaging
- real-session validation against local Codex behavior

## Dependencies

- `SDP/06--Design/06.01--AppServerIntegration.md`
- `SDP/06--Design/06.02--ThreadAndSessionModel.md`
- `SDP/06--Design/06.03--BridgeAPI.md`
- Sprint 003 send-and-preview baseline

## Concrete Execution Phases

### Phase 1 - Attachment Semantics and Capability Propagation
Goal:
- make Mode B fidelity explicit in the canonical model so the UI stops relying on implicit success signals

Execution:
- finalize the attached, mirrored, and fallback mode vocabulary
- define attachability or confidence fields where needed
- propagate adapter capability flags through the canonical model and bridge API
- define how missing, partial, or downgraded attachment support is exposed

Outputs:
- an explicit attachment model
- a bridge-facing contract for capability and fidelity state

### Phase 2 - Event Transport and Polling Abstraction
Goal:
- provide near-live conversation updates without assuming the local surface supports subscriptions

Execution:
- implement event subscription when the adapter supports it
- implement polling fallback behind the same UI-facing event surface
- define reconnect, backoff, and stale-state behavior
- define how partial assistant output is represented when available

Outputs:
- a unified live-update mechanism
- an explicit fallback path for non-streaming environments

### Phase 3 - Real Session Validation Matrix
Goal:
- verify the live-update and attachment model against actual local behavior instead of only interface assumptions

Execution:
- test against real local Codex sessions if available
- verify whether discovery, attach, send, and update behaviors match the model
- document where the bridge is truly attached versus only mirrored or degraded
- capture any desktop-versus-VS-Code differences that materially affect the product

Outputs:
- a grounded Mode B validation record
- precise residual risks for any unsupported behavior

### Phase 4 - UX Truthfulness and Status Hardening
Goal:
- keep the user-facing UI honest about what the bridge is actually doing

Execution:
- surface connection, attachment, and degraded-state messaging clearly
- avoid labels that imply true live attachment when the bridge is only mirroring or polling
- add refresh-state feedback so latency does not look like data loss

Outputs:
- clearer user trust signals
- reduced ambiguity around Mode B limitations

### Phase 5 - Verification and Planning Hardening
Goal:
- leave behind a dependable attachment and update baseline for final fallback hardening

Execution:
- verify event or polling updates locally
- verify attachment-state transitions locally
- update `implementationNotes.md` with verified behavior only
- record any unresolved Mode B limits as explicit backlog or refactor inputs

Outputs:
- a verified live-update baseline
- a bounded definition of actual Mode B fidelity

## Non-Goals

- no broad remote deployment
- no hidden assumption that Mode B always works
- no attempt to hide polling or mirrored behavior behind attached wording

## Exit Criteria

- the UI exposes real attachment state
- the system updates conversations without full-page reloads
- fallback behavior remains visible and usable
- residual Mode B limitations are documented concretely

## Proposed Scrum Iterations

### Iteration 001 - Attachment Model and Event Contract Baseline
Focus:
- define the truth model for attachment fidelity and the event contract before implementing update transport details

Detailed TODO:
- [ ] Finalize attached, mirrored, and fallback mode semantics.
- [ ] Add capability and attachability fields to the canonical model.
- [ ] Define the bridge event contract for update notifications.
- [ ] Define polling fallback semantics so the UI sees one update model.
- [ ] Capture any unresolved protocol limitations that affect live attachment.

### Iteration 002 - Live App-Server Discovery and Read Path
Focus:
- connect to the official local Codex app-server over `stdio` for real session and thread reads, surface the active live adapter clearly in the UI, and begin live send support while retaining the local-state adapter as fallback

Detailed TODO:
- [x] Validate the official Codex app-server transport surface and generated protocol artifacts.
- [x] Implement a `stdio` app-server adapter that can initialize and enumerate sessions/threads.
- [x] Compare `stdio` app-server reads against the existing local-state adapter output.
- [x] Compare live app-server reads against the existing local-state adapter output.
- [x] Define adapter selection order: live app-server first, local-state mirror second, fixture last.
- [x] Expose the active adapter and capability state clearly in the API and UI.
- [x] Implement the first live send path against the `stdio` app-server adapter.
- [x] Refine the shell so the main mode switch is always visible and the desktop layout feels closer to the Codex desktop mental model.

### Iteration 003 - Live Update Implementation
Focus:
- implement subscriptions where possible and polling where necessary behind one UI-facing shape

Detailed TODO:
- [ ] Implement subscription-based updates for capable adapters.
- [ ] Implement polling fallback with refresh cadence and backoff rules.
- [ ] Handle reconnect and stale-state behavior.
- [ ] Surface partial assistant output when the underlying transport supports it.
- [ ] Verify conversation updates without full-page reloads.

### Iteration 004 - Cross-Platform Thread Continuity and Live Reasoning Sync
Focus:
- make a conversation feel like the same conversation across Codex Desktop and all connected CodexRemote browsers, so users can start on one surface and follow or continue on another

Detailed TODO:
- [x] Define the project-to-active-thread continuity rule across desktop and web activity.
- [x] Make the shared active-thread state converge predictably across all connected web UIs.
- [x] Promote the most recently advanced desktop-originated project thread into the shared active-thread state when appropriate.
- [x] Add live-follow updates for the active conversation so phone browsers can observe assistant progress started elsewhere.
- [ ] Add UI truthfulness around whether the user is following a persisted shared thread or a truly attached live thread.
- [ ] Verify desktop-to-web and web-to-web continuity using real Codex project threads.

### Iteration 005 - Real-Session Validation and UX Truthfulness
Focus:
- validate the live behavior against real sessions and ensure the UI communicates that behavior honestly

Detailed TODO:
- [ ] Validate attachment and update behavior against real local Codex sessions if available.
- [ ] Document desktop-versus-VS-Code differences that matter to the bridge.
- [ ] Surface degraded, mirrored, and polling states clearly in the UI.
- [ ] Update `implementationNotes.md` with verified findings only.
- [ ] Capture any remaining Mode B gaps as future work rather than silent assumptions.
