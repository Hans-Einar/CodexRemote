# Implementation Notes

## Iteration 002 Start (2026-04-02)

Current validated baseline before live app-server transport work:

- local-state mirror adapter exists and reads from `.codex/state_5.sqlite` plus rollout JSONL files
- adapter selection now prefers the local-state adapter over the fixture when local Codex state exists
- official Codex app-server docs and local CLI help now confirm `stdio` as the default app-server transport
- generated protocol schema and TypeScript bindings were exported locally for implementation work

## Open focus

- implement the `stdio` app-server adapter
- prove the first live read path
- keep fallback ordering explicit

## Iteration 002 Progress (2026-04-02)

Validated findings:

- the installed Codex CLI exposes `app-server` and documents `stdio://` as the default transport
- official app-server schema and TypeScript bindings were generated locally into `tmp-app-server-spec/`
- the first `stdio` JSON-RPC client and app-server adapter were implemented
- adapter selection now prefers the `stdio` app-server adapter before the local-state mirror and fixture
- real-machine probing confirms the `stdio` adapter can initialize successfully on this host

Current known gap:

- a project-scoped `thread/list` call for `C:\\Users\\hanse\\GIT\\CodexRemote` currently returns no threads even though the local-state mirror shows matching local threads, so the next step is to resolve the live app-server filtering and/or thread enumeration behavior

## Iteration 002 Validation Update (2026-04-02)

Resolved finding:

- the app-server `thread/list` cwd filter on Windows requires the long-path form (`\\\\?\\C:\\...`) for project-scoped enumeration

Validated live behavior on this host:

- the `stdio` app-server adapter initializes successfully
- project-scoped `thread/list` now returns live Codex threads for `C:\\Users\\hanse\\GIT\\CodexRemote`
- `thread/read` returns real message history for those live threads

Current next focus:

- surface the active live adapter state more clearly in the UI
- continue from live read into live send / turn-start support

## Iteration 002 Live Send Update (2026-04-02)

Resolved findings:

- the first live send path now works through the official `stdio` app-server adapter by combining `thread/start`, `turn/start`, and polling `thread/read` until the turn completes
- the active bridge state is now surfaced more clearly in the UI through adapter and send-capability pills plus a dedicated conversation composer state
- the desktop shell now defaults to one primary surface at a time (`Conversation view` or `Workspace view`) with a calmer sidebar and a less diagnostic-heavy header

Validated live behavior on this host:

- the actual adapter code path can create a new temp-folder thread through the installed Codex binary
- a real `turn/start` call completes successfully and `thread/read` returns the assistant result
- a runtime smoke prompt of `Reply with exactly READY` returned `READY` through the live adapter code path

Current remaining focus:

- move from polling-only completion toward notification-backed live updates
- decide how much of the Codex desktop diff/update model should be mirrored directly in CodexRemote

## Iteration 002 Conversation UX and Existing-Thread Send Update (2026-04-02)

Resolved findings:

- persisted desktop threads require `thread/resume` before `turn/start`; direct `turn/start` against a listed historical thread can fail with `thread not found`
- the first live-send implementation now resumes existing desktop threads before sending, so CodexRemote can continue real project conversations instead of only starting new ones

Validated behavior on this host:

- sending `hello from codexRemote` into an existing desktop-backed CodexRemote thread now succeeds through the bridge API and returns the updated conversation
- the conversation view now uses a bounded scroll surface instead of growing the full page vertically
- the bridge API now supports tail-style thread reads via `limit`, and the UI requests a bounded slice first and loads older entries on demand when the user scrolls upward
- the web shell now polls sessions, thread lists, and the active thread so new external activity can appear without a full page reload

Current UI status:

- user and assistant entries now render as role-colored expandable cards
- expanded cards currently reveal the full captured message content
- richer per-turn file-change statistics and diff-sidepanel behavior still require a deeper turn-item model from the app-server and are not implemented yet

## Iteration 002 Shared Thread-State Update (2026-04-02)

Resolved findings:

- the separate `stdio` app-server process does not share Codex Desktop's in-memory loaded-thread state, so true "current desktop tab" mirroring cannot rely on `thread/loaded/list`
- a practical cross-platform sync model is still achievable by treating the project's active thread as shared persisted state and reconciling it against the most recently updated project thread

Implemented behavior:

- CodexRemote now stores a shared active-thread state per project in SQLite
- web thread selection updates that shared state, so all connected web UIs can converge on the same project conversation
- project thread polling now reconciles against the most recently updated project thread, so desktop-side conversation activity can move the shared active thread forward without a manual page reload
- the stdio adapter now sorts project threads by `updatedAt` so "project latest" really follows the newest persisted thread activity

Current limitation:

- this is still a persistence-based sync model, not a true shared in-memory attachment to the desktop app's current open tab
- live reasoning visibility across platforms still depends on polling persisted thread history, not app-server push notifications

## Iteration 003 Runtime Controls Update (2026-04-02)

Implemented behavior:

- CodexRemote now reads the live app-server model list and rate-limit usage snapshot
- the conversation composer now exposes model selection, reasoning level, and access mode controls
- send requests now pass the selected model, reasoning effort, and sandbox/access settings through the live `stdio` adapter
- `Full access` currently maps to `danger-full-access` with `approvalPolicy: never` so remote turns do not stall waiting for an unsupported approval interaction

Current limitation:

- the richer live activity trace the user asked for still needs additional surfacing of app-server turn items or notification deltas and is not yet shown as a dedicated metadata feed

## Iteration 003 Activity Feed Update (2026-04-02)

Implemented behavior:

- CodexRemote now parses additional app-server thread items beyond plain messages
- the conversation view includes a dedicated `Live Activity` panel that surfaces command executions, plan updates, reasoning items, file changes, MCP tool calls, and web activity when those items are present in the thread
- command executions are rendered in the style of `Ran <command> for <duration>` when duration data is available
- this activity feed updates through the existing active-thread polling path, so it becomes visible across connected web UIs as persisted thread items appear

Current limitation:

- this is still based on polled thread-read data, not notification-backed deltas, so the feed is near-live rather than true streamed activity

## Iteration 003 Notification-Backed Live Feed Update (2026-04-02)

Implemented behavior:

- the `stdio` app-server transport now captures JSON-RPC notifications in addition to request responses
- the live adapter normalizes thread-scoped notifications such as turn start/completion, item start/completion, agent deltas, plan deltas, reasoning deltas, file-change deltas, and token-usage updates
- the bridge now exposes a thread-scoped SSE endpoint so the browser can subscribe to live thread events
- the CodexRemote conversation view now uses those events to update the `Live Activity` panel immediately instead of waiting only on the next polling cycle

Current limitation:

- this is a hybrid model: turns initiated through CodexRemote can now surface notification-backed live feed updates, while desktop-originated turns running through a separate app-server process still rely on persisted-thread polling fallback

## Iteration 003 Streaming UX Refinement Update (2026-04-02)

Implemented behavior:

- live notifications are now grouped by active turn/item instead of rendering as flat duplicate entries
- the `Streaming now` section now favors in-progress assistant/reasoning/file activity and drops completed streamed groups once the persisted thread snapshot has caught up
- persisted file-change activities now expose file links that can open the file in the workspace view
- persisted file-change activities also expose collapsible diff previews when diff text is available from the thread item payload
- the conversation history panel is now height-bounded and scrollable without forcing the entire page to grow vertically
- the visible thread-title header block above the conversation history has been removed to reduce noise, while the selected thread still remains available in the sidebar and screen-reader structure

## Iteration 003 Conversation Card Integration Update (2026-04-02)

Implemented behavior:

- conversation history now renders as turn-level conversation cards instead of flat per-message cards
- work summary and live streaming activity now live inside the expanded conversation card instead of a separate activity panel
- the standalone activity panel has been removed so idle threads no longer show an always-present empty work surface
- file-change items inside expanded cards now render as file links
- clicking an edited file from a card can switch to the workspace and open a read-only diff view in the editor surface when diff text is available
- the conversation entry region remains height-bounded and scrollable so long histories do not grow the entire page vertically

## Next Planned Iteration

The next dedicated Sprint 004 iteration should focus on cross-platform thread continuity and live reasoning sync:

- make a project conversation feel like the same conversation across Codex Desktop and all connected CodexRemote browsers
- converge all connected web UIs on the same shared active project thread
- improve desktop-originated thread promotion so CodexRemote follows the conversation the user actually continued elsewhere
- strengthen live-follow behavior so a phone browser can observe assistant progress started from desktop or another web UI
- keep the UI honest about the difference between shared persisted-thread continuity and true attached live streaming

## Verification
- `npm test`
- `npm run build`

## Iteration 003 Workspace Git Rail Update (2026-04-03)

Implemented behavior:

- the desktop shell now keeps a persistent Git right rail that mirrors the width of the left rail and stays visible in both conversation and workspace modes
- the right rail lists touched files from Git status together with per-file `+` and `-` line counts, and clicking a file opens its diff in the workspace editor
- Git workflow controls moved into a modal overlay with push, pull, checkout, branch creation, stage-all, and commit actions
- the commit section now shows the currently staged file list instead of only raw action buttons
- the Git rail now renders touched files and folders through the same tree visual as the workspace explorer instead of per-file cards
- the desktop workspace shell is now viewport-bounded so the center panel fills the middle column while overflow stays inside the side rails instead of growing the browser window
- the desktop shell now exposes horizontal resize splitters on both sides of the center panel so the left and right sidebars can be resized independently

Validation:

- `npm run typecheck`
- `npm test -- src/server/app.test.ts`
- `npm test -- src/web/App.test.tsx`
