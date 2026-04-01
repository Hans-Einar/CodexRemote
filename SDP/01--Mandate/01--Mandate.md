# Mandate - Codex Local Web Companion (Mode B Primary)

**Status:** Draft v0.1  
**Date:** 2026-04-01  
**Source:** `SDP/01--Mandate/mandate_codex_web_companion.md`

## 1) Purpose
Build a local web-based companion that connects to Codex Desktop or App sessions and allows:

- viewing conversations
- sending prompts
- browsing workspace files
- previewing markdown

Primary goal:

- attach to existing live Codex threads (Mode B)

Fallback:

- run independent threads (Mode A)

## 2) Core Intent

### Mode B (Primary)
Attach to the same project or session used by:

- Codex Desktop App
- VS Code Codex extension

Capabilities:

- read synced threads
- continue conversation
- observe updates with best-effort live behavior

### Mode A (Fallback)
If Mode B is not feasible:

- create and manage independent threads via app-server access
- operate as a parallel local client

## 3) System Overview

### Components
1. Local Codex app server or equivalent existing local integration surface
2. Node.js sidecar bridge
3. Vite web UI with mobile-friendly behavior

## 4) Architecture

```text
[Codex Desktop / VS Code]
        |
   [App Server]
        |
   [Node Bridge]
        |
     [Web UI]
```

## 5) Key Assumptions
- The app server or comparable local integration surface is locally accessible.
- ChatGPT login may be reusable without a separate API key.
- Threads may be project-scoped and syncable across local Codex surfaces.

## 6) Functional Requirements

### FR-1 Conversation
- list threads
- read messages
- send prompts

### FR-2 Workspace
- file tree
- read files
- markdown preview

### FR-3 Sync (Mode B)
- discover existing sessions
- attach or mirror existing threads

### FR-4 Streaming (optional)
- subscribe to events if available
- fall back to polling otherwise

## 7) Technical Strategy

### Bridge (Node)
- connect to app-server functionality through the available local transport
- expose a stable HTTP and WebSocket API for the browser client

### UI (Vite)
- chat view
- file browser
- markdown renderer

## 8) Study Required
The repository must investigate:

1. app-server protocol
2. authentication reuse
3. thread sync between desktop and VS Code
4. stdio vs WebSocket feasibility

## 9) Risks

| Risk | Impact |
|------|--------|
| Cannot attach to live threads | Fall back to Mode A |
| No live streaming surface | Polling required |
| Auth restrictions | Session reuse or proxying needed |

## 10) Acceptance Criteria

### Mode B success
- the web UI shows the same thread as desktop
- the user can continue the conversation from the web UI

### Mode A fallback
- the web UI still provides full local functionality using separate threads

## 11) Next Step
Generate the study baseline and validate Mode B feasibility first.
