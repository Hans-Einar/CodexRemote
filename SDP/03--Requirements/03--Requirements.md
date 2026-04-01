# Requirements - CodexRemote Baseline

**Status:** Draft v0.1  
**Date:** 2026-04-01  
**Source:** `SDP/02--Study/02--Study.md`

## 1) Functional Requirements

1. REQ-001 The system shall discover or enumerate locally available Codex sessions or equivalent conversation containers.
2. REQ-002 The system shall list threads for a selected session when the local integration surface supports thread separation.
3. REQ-003 The system shall read ordered message history for a selected thread or conversation.
4. REQ-004 The system shall allow the user to send a prompt to a selected thread.
5. REQ-005 The system shall support Mode B attachment to existing live threads when the local integration surface allows it.
6. REQ-006 The system shall support Mode A local fallback threads when Mode B is unavailable or incomplete.
7. REQ-007 The system shall distinguish Mode B attached work from Mode A managed fallback work in the UI.
8. REQ-008 The system shall browse the active workspace file tree.
9. REQ-009 The system shall read text files from the active workspace.
10. REQ-010 The system shall preview markdown files.
11. REQ-010A The system shall support an explorer-style tree view for workspace navigation.
12. REQ-010B The system shall support in-app text editing for supported workspace files.
13. REQ-010C The system shall allow saving supported workspace files back to disk inside the selected workspace root.
14. REQ-010D The system shall support an in-app local terminal surface for executing commands in the selected workspace.
11. REQ-011 The system shall expose conversation metadata needed to distinguish threads, sessions, and workspaces.
12. REQ-012 The system shall support best-effort live updates through event subscription when available.
13. REQ-013 The system shall fall back to polling when event subscription is unavailable.
14. REQ-014 The system shall display user, assistant, and system messages distinctly when that information is available.
15. REQ-015 The system shall handle partial assistant output when the underlying transport exposes it.

## 2) Architecture and Integration Requirements

1. REQ-016 The bridge shall isolate app-server protocol details from the browser client.
2. REQ-017 The bridge shall expose a stable local API surface for the web UI.
3. REQ-018 The canonical session and thread model shall remain independent from the specific transport used to reach the local Codex surface.
4. REQ-019 Workspace access shall be separated from chat and session integration logic.
5. REQ-020 The first scope of workspace access shall be read-only.
6. REQ-020A A later interactive scope may allow file writes for supported text files, but writes shall remain constrained to the selected workspace root.
6. REQ-021 The system shall avoid persisting tokens, cookies, or other auth secrets in repository files.
7. REQ-022 The bridge shall support streaming-capable and non-streaming adapters behind the same UI-facing contract.
8. REQ-023 The design shall allow protocol adapters to evolve without requiring a full UI rewrite.
9. REQ-023A The bridge shall isolate terminal-process management from the browser terminal renderer.
10. REQ-023B The UI shall prefer maintained editor, tree, and terminal components over custom implementations when they fit the architecture.

## 3) UX and Operational Requirements

1. REQ-024 The web UI shall remain usable on desktop and mobile-sized viewports.
2. REQ-025 The UI shall communicate connection state clearly.
3. REQ-026 The UI shall expose attachability or fallback status clearly when live thread attachment is not available.
4. REQ-027 The system shall degrade gracefully when session discovery, thread attach, or streaming are unavailable.
5. REQ-028 The system shall prioritize local operation and should not require a separate API key if existing local auth can be reused safely.
6. REQ-029 The UI shall support quick switching between conversation view and workspace preview.

## 4) Non-Functional Requirements

1. REQ-030 The system shall default to local-only operation.
2. REQ-031 Any network exposure beyond localhost shall be explicit and disabled by default.
3. REQ-032 Workspace browsing shall respect the selected project boundary.
4. REQ-033 Repository memory and planning state shall be maintained in SDP documents.
5. REQ-034 Undocumented protocol assumptions shall be recorded as risks in SDP before implementation depends on them heavily.
6. REQ-035 Local verification shall cover thread listing, message send, file browsing, and markdown preview when those capabilities exist.
