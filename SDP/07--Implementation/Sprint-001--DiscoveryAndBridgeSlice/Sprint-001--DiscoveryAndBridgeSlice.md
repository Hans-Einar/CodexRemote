# Sprint 001 - Discovery and Bridge Slice

## Goal
Establish the first local bridge shell, health surface, and adapter contract while validating the primary local integration path.

## Scope

- bridge process bootstrap
- health endpoint
- adapter contract
- initial session discovery path
- documented local dev-port allocation for bridge and Vite UI

## Dependencies

- `SDP/02--Study/02--Study.md`
- `SDP/03--Requirements/03--Requirements.md`
- `SDP/04--Architecture/04--Architecture.md`
- `SDP/06--Design/06.01--AppServerIntegration.md`
- `SDP/06--Design/06.03--BridgeAPI.md`

## Concrete Execution Phases

### Phase 1 - Sprint Activation and Port Baseline
Goal:
- confirm Sprint 001 as the active execution surface
- reserve the initial local development ports before implementation spreads across documents and config

Execution:
- confirm this sprint as the bootstrap owner for bridge setup work
- reserve Vite dev port `5280` instead of the default `5173`
- reserve the initial bridge API port `3180` unless implementation evidence later requires a change
- document the rule that the browser UI and the bridge must not silently auto-shift ports during normal development

Outputs:
- a clear port-allocation decision for early implementation
- a stable bootstrap boundary for later sprint work

### Phase 2 - Local Codex Surface Reconnaissance
Goal:
- reduce the unknowns around the first reachable local Codex integration path

Execution:
- inspect how the local Codex surface can be contacted
- identify likely transport options, startup assumptions, and discovery primitives
- record which parts of the local protocol are known, assumed, or still unverified
- identify which auth material can be reused transiently and which material must never be persisted

Outputs:
- a validated or bounded discovery approach
- documented protocol and auth assumptions for the adapter layer

### Phase 3 - Adapter Contract and Capability Model
Goal:
- define the first bridge-facing abstraction before the runtime shell grows around undocumented details

Execution:
- define the adapter operations for session discovery, thread resolution, message read, message send, and optional subscription
- define capability flags such as attach support, streaming support, and workspace-hint support
- define the initial normalized error model and capability-reporting shape
- define the minimum data returned by the discovery path

Outputs:
- a first adapter contract
- a first capability and error contract for bridge consumers

### Phase 4 - Bridge Runtime Bootstrap
Goal:
- stand up the first local process shell that can host future bridge behavior

Execution:
- create the runtime entry point and baseline configuration loading
- expose a local health endpoint
- expose a basic discovery endpoint or stubbed route consistent with the chosen contract
- add structured logging for startup, discovery, and recoverable failure paths

Outputs:
- a runnable bridge shell
- a minimal API surface ready for Sprint 002

### Phase 5 - Verification and Planning Hardening
Goal:
- leave behind a trustworthy bootstrap increment instead of only exploratory notes

Execution:
- verify local startup behavior
- verify the health route
- verify the first discovery flow or document its current blocking gap precisely
- update `implementationNotes.md` after successful verification
- feed any unresolved protocol risk back into SDP documents

Outputs:
- a locally verifiable Sprint 001 baseline
- clear carry-over items for Sprint 002 if discovery remains partial

## Non-Goals

- no workspace browser yet
- no full conversation UI yet
- no claim of Mode B attachment unless proven
- no browser-based editor embedding yet

## Exit Criteria

- bridge boots locally
- health endpoint responds
- session discovery path is documented and testable
- Vite dev-port selection is documented as `5280`

## Proposed Scrum Iterations

### Iteration 001 - Bootstrap and Discovery Boundary
Focus:
- establish the sprint boundary, reserve ports, and define the first adapter contract against the real local integration constraints

Detailed TODO:
- [ ] Confirm Sprint 001 as the active bridge-bootstrap execution surface.
- [ ] Reserve Vite dev port `5280` and bridge API port `3180` in the sprint planning surface.
- [ ] Inspect the first reachable local Codex surface and document transport candidates.
- [ ] Capture the minimum auth-handling rules needed for safe local experimentation.
- [ ] Define the first adapter contract, capability flags, and error model.
- [ ] Define the expected output shape for session discovery.

### Iteration 002 - Bridge Shell and Health Surface
Focus:
- implement the first runnable bridge shell using the Iteration 001 contracts

Detailed TODO:
- [ ] Create the bridge runtime entry point and config loading path.
- [ ] Add the local health endpoint.
- [ ] Add the first discovery endpoint or stubbed equivalent.
- [ ] Add structured startup and error logging.
- [ ] Verify bridge startup on the reserved local port.

### Iteration 003 - Discovery Hardening and Carry-Over Control
Focus:
- validate the discovery flow end to end and capture precise unresolved issues

Detailed TODO:
- [ ] Verify the discovery path against the local Codex surface.
- [ ] Record whether discovery is real, partial, mocked, or blocked.
- [ ] Update `implementationNotes.md` with only verified work.
- [ ] Promote unresolved protocol risks into SDP documents.
- [ ] Prepare handoff-ready carry-over notes for Sprint 002 if needed.
