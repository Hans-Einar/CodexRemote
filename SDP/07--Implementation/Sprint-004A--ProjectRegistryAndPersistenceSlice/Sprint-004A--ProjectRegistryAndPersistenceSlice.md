# Sprint 004A - Project Registry and Persistence Slice

## Goal
Introduce a persistent multi-project registry backed by SQLite so CodexRemote can serve the same project list to multiple browsers on the same host.

## Scope

- SQLite-backed project registry
- project add and list API
- project-aware workspace and Git API routing
- per-browser selected-project UI state
- persistent shared project metadata

## Dependencies

- `SDP/06--Design/06.02--ThreadAndSessionModel.md`
- `SDP/06--Design/06.03--BridgeAPI.md`
- `SDP/06--Design/06.04--WorkspaceAndPreview.md`
- current first-boot baseline

## Concrete Execution Phases

### Phase 1 - Registry Model and Persistence Surface
Goal:
- define the project record shape and persist it in SQLite on the host machine

Execution:
- define project fields such as id, display name, root path, optional browser IDE URL, and timestamps
- create the SQLite schema and bootstrap path
- implement list and create operations

### Phase 2 - Project-Aware Backend Routing
Goal:
- route workspace, Git, and terminal operations through the selected project instead of always using process cwd

Execution:
- resolve project roots from the registry
- add project-aware workspace, Git, and terminal paths
- preserve graceful errors for unknown project ids and invalid roots

### Phase 3 - Project Selection UI
Goal:
- make project choice explicit in the browser UI without forcing a single global active project across all browsers

Execution:
- list persisted projects
- add project registration UI
- select one project in the current browser session
- update workspace and Git panes when the selected project changes

### Phase 4 - Verification and Hardening
Goal:
- verify the host can serve the same persisted project list to multiple browsers

Execution:
- verify project creation persists across reloads
- verify project list survives process restart
- update implementation notes with verified behavior only

## Exit Criteria

- projects are stored in SQLite
- added projects are visible to all browsers connected to the same host
- workspace and Git behavior follow the selected project
