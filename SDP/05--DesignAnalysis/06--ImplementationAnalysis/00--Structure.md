# Implementation Analysis - Target Structure

Current repository structure is documentation-first and does not yet include application code.

The target implementation ownership should separate responsibilities approximately like this:

```text
/src/
  /bridge/       # protocol adapters for local Codex surfaces
  /server/       # HTTP and WebSocket routes
  /session/      # canonical session, thread, and event orchestration
  /workspace/    # workspace discovery, tree listing, safe file reads
  /shared/       # DTOs and shared contracts
  /web/          # browser UI
/tests/          # smoke and integration tests
```

Planned implementation-analysis ownership snapshot:

```text
/SDP/05--DesignAnalysis/06--ImplementationAnalysis/
  /01--AppServerProtocol
  /02--SessionAndThreadSync
  /03--BridgeRuntime
  /04--WorkspaceAndMarkdown
  /05--WebUI
```
