# Sprint 002 - Thread Read and Workspace Slice

## Goal
Expose readable conversations and read-only workspace browsing through the bridge and the first usable UI shell.

## Scope

- thread listing
- thread read
- workspace tree
- text-file read
- minimal UI shell
- browser-based editor embedding feasibility study

## Dependencies

- `SDP/06--Design/06.02--ThreadAndSessionModel.md`
- `SDP/06--Design/06.03--BridgeAPI.md`
- `SDP/06--Design/06.04--WorkspaceAndPreview.md`
- Sprint 001 bootstrap outputs

## Concrete Execution Phases

### Phase 1 - Canonical Thread Read Surface
Goal:
- expose read-only conversation data through the bridge using normalized models rather than raw protocol payloads

Execution:
- implement session and thread list reads
- implement thread-history reads
- map adapter data into canonical session, thread, and message DTOs
- ensure the bridge can report capability or degradation information alongside reads

Outputs:
- bridge read endpoints for sessions, threads, and thread history
- normalized DTOs suitable for UI consumption

### Phase 2 - Workspace Boundary and Safe File Read Surface
Goal:
- expose the active project workspace through a read-only API with clear safety boundaries

Execution:
- resolve or declare the workspace root used by the bridge
- implement directory listing
- implement text-file read
- enforce path normalization and project-boundary checks
- define initial file-size and unsupported-file behavior

Outputs:
- read-only workspace tree and file-read endpoints
- documented path-safety and file-handling rules

### Phase 3 - First Usable UI Shell
Goal:
- create the first browser UI that can browse conversations and files through the bridge

Execution:
- bootstrap the Vite UI using the reserved dev port `5280`
- render session or thread navigation
- render conversation history
- render workspace tree and text-file content
- display connection state, current mode, and basic degraded-state messaging

Outputs:
- a minimal but usable local browser shell
- the first end-to-end read-only experience

### Phase 4 - Browser-Based Editor Embedding Feasibility
Goal:
- understand whether a browser-based VS Code-style editor belongs in the near-term roadmap and what technical shape it should take

Execution:
- compare at least these approaches: `OpenVSCode Server`, `code-server`, and a `Monaco`-first editor backed by the bridge file API
- evaluate how each option would access local files safely through the server boundary
- evaluate whether embedded editing requires a fuller extension-host model than the current bridge scope
- decide whether the first product baseline should remain preview-only or expose an editor handoff surface later

Outputs:
- a documented feasibility recommendation
- a scope decision for whether embedded editing stays deferred

### Phase 5 - Verification and Planning Hardening
Goal:
- verify that Sprint 002 delivers a coherent read-only baseline

Execution:
- verify thread list and thread read flows
- verify workspace tree and file read flows
- verify the Vite UI on port `5280`
- update `implementationNotes.md` with verified results only
- capture editor-embedding follow-up items without silently widening current scope

Outputs:
- a verified read-only CodexRemote baseline
- a documented editor-embedding recommendation

## Non-Goals

- no prompt send yet
- no markdown preview polish yet
- no live streaming guarantee yet
- no committed full IDE embedding yet

## Exit Criteria

- a user can browse a thread and read its messages
- a user can browse the workspace tree and open a text file
- the UI exposes current mode and connection state
- a documented recommendation exists for browser-based editor embedding

## Proposed Scrum Iterations

### Iteration 001 - Read APIs and Workspace Safety Baseline
Focus:
- build the bridge-side read contracts before UI integration

Detailed TODO:
- [ ] Implement session-list and thread-list reads.
- [ ] Implement thread-history reads mapped into canonical DTOs.
- [ ] Define how degraded or capability-limited read states are surfaced.
- [ ] Resolve or declare the initial workspace root strategy.
- [ ] Implement directory listing with project-boundary enforcement.
- [ ] Implement text-file read with normalized path handling.

### Iteration 002 - UI Shell on Reserved Vite Port
Focus:
- connect the read APIs into a usable browser shell running on the chosen non-default port

Detailed TODO:
- [ ] Bootstrap the Vite client on port `5280`.
- [ ] Render session or thread navigation.
- [ ] Render conversation history from canonical DTOs.
- [ ] Render workspace tree and text-file content.
- [ ] Surface connection state and current mode in the shell.

### Iteration 003 - Editor Feasibility and Read-Only Hardening
Focus:
- close Sprint 002 with a documented editor recommendation and verified read-only behavior

Detailed TODO:
- [ ] Compare `OpenVSCode Server`, `code-server`, and `Monaco`-backed editing against the bridge architecture.
- [ ] Document whether local-file editing should remain out of scope for the first product baseline.
- [ ] Verify end-to-end thread and workspace read flows.
- [ ] Update `implementationNotes.md` with verified work only.
- [ ] Record any follow-up editor decision as future sprint or refactor input.
