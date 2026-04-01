# Architecture - CodexRemote Baseline

**Status:** Draft v0.1  
**Date:** 2026-04-01  
**Source:** `SDP/03--Requirements/03--Requirements.md`

## 1) Purpose
Describe the baseline target architecture for CodexRemote before detailed design work is locked in.

## 2) Deployment Model
CodexRemote is a local-first application.

The expected deployment shape is:

- a local Node bridge process
- a local browser UI
- access to an existing Codex local integration surface such as an app server
- access to the active workspace on the same machine

The bridge is the only component that should talk directly to local Codex internals and the filesystem.

## 3) Context Diagram

```text
[Codex Desktop / VS Code]
          |
   [Local Codex Surface]
          |
   [Node Bridge + API]
       /         \
[Workspace]   [Web UI]
```

## 4) Core Subsystems

### 4.1 App-server adapter
Responsibilities:

- discover local sessions
- enumerate or resolve threads
- read messages
- send prompts
- subscribe to updates when possible

### 4.2 Session and thread service
Responsibilities:

- translate protocol-specific data into a canonical model
- track whether the current work is attached Mode B or fallback Mode A
- expose consistent identifiers to the UI

### 4.3 Workspace service
Responsibilities:

- resolve the active workspace root
- list files and folders
- read text and markdown files
- enforce project-boundary checks

### 4.4 Local API layer
Responsibilities:

- expose HTTP endpoints for query-style operations
- expose WebSocket events for live updates when available
- convert adapter failures into stable error responses

### 4.5 Web UI
Responsibilities:

- render thread list and conversation state
- render connection and mode status
- browse workspace files
- preview markdown

## 5) Operating Modes

### Mode B
The bridge attaches to an existing local session or thread and mirrors or continues live work.

### Mode A
The bridge owns separate local threads through the available integration surface and presents them through the same UI.

## 6) Target Repository Structure
No application code is present yet, but the target implementation structure should separate concerns approximately like this:

```text
/src/
  /bridge/       # protocol-specific adapters
  /server/       # HTTP and WebSocket API
  /session/      # canonical session and thread orchestration
  /workspace/    # workspace discovery and safe file access
  /shared/       # shared contracts and DTOs
  /web/          # browser UI
/tests/          # smoke and integration coverage
```

## 7) Key Architecture Rules

- Keep protocol details behind the bridge adapter boundary.
- Keep workspace access isolated from conversation transport logic.
- Keep the UI unaware of app-server transport details.
- Prefer read-only workspace behavior in the first scope.
- Support both event-driven and polling-based update paths.

## 8) Primary Risks

- live attachment may not be possible on stable identifiers alone
- streaming may not exist or may be incomplete
- workspace-root discovery may depend on undocumented behavior
- auth reuse may be possible but operationally fragile
