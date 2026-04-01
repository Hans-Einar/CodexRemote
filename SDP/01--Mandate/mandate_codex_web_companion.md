# Mandate — Codex Local Web Companion (Mode B Primary)

## 1. Purpose
Build a local web-based companion that connects to Codex Desktop/App sessions and allows:
- viewing conversations
- sending prompts
- browsing workspace files
- previewing markdown

Primary goal: attach to **existing live Codex threads (Mode B)**  
Fallback: run independent threads (Mode A)

---

## 2. Core Intent

### Mode B (Primary)
Attach to the same project/session used by:
- Codex Desktop App
- VS Code Codex extension

Capabilities:
- read synced threads
- continue conversation
- observe updates (best effort live)

### Mode A (Fallback)
If Mode B is not feasible:
- create/manage own threads via app-server
- operate as parallel client

---

## 3. System Overview

### Components
1. Local Codex App Server (existing)
2. Node.js sidecar bridge
3. Vite web UI (mobile-friendly)

---

## 4. Architecture

```
[Codex Desktop / VS Code]
        ↕
   [App Server]
        ↕
   [Node Bridge]
        ↕
     [Web UI]
```

---

## 5. Key Assumptions
- App Server is locally accessible
- ChatGPT login works without API key
- Threads may be project-scoped and syncable

---

## 6. Functional Requirements

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
- attach or mirror

### FR-4 Streaming (optional)
- subscribe to events if available
- fallback to polling

---

## 7. Technical Strategy

### Bridge (Node)
- connect to app-server (stdio or websocket)
- expose HTTP/WebSocket API

### UI (Vite)
- chat view
- file browser
- markdown renderer

---

## 8. Study Required (STUDY.md input)

Codex agent must investigate:

1. App Server protocol
   - thread model
   - session identifiers
   - event streaming

2. Authentication
   - ChatGPT login reuse
   - token handling

3. Thread sync
   - how desktop + VS Code share threads
   - whether external client can attach

4. Transport
   - stdio vs websocket feasibility

---

## 9. Risks

| Risk | Impact |
|------|--------|
| Cannot attach to live threads | fallback to Mode A |
| No live streaming | polling required |
| Auth restrictions | reuse session or proxy |

---

## 10. Acceptance Criteria

Mode B success:
- web UI shows same thread as desktop
- can continue conversation

Mode A fallback:
- full functionality but separate threads

---

## 11. Next Step

Generate:
- STUDY.md

Focus:
- validating Mode B feasibility first
