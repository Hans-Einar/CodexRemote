# Agent Reminders

- Read `AGENTS.md` and this file before starting substantial work.
- Use `SDP/Instructions/SoftwareDevelopmentProcess.md` as the baseline when work is scoped to SDP documents, a sprint, or a refactor track.
- Treat Mode B live-thread attachment as the primary goal until study results prove it infeasible.
- Keep the local-first boundaries explicit: app-server integration, bridge API, workspace access, and web UI.
- Do not assume remote deployment, cloud sync, or API-key-based auth unless the active SDP documents explicitly add that scope.
- Update the active SDP documents before broad implementation changes when scope or approach changes materially.
- Update `implementationNotes.md` only after work is completed and locally verified.
- Keep documents in English unless the user explicitly asks for another language.
- Do not persist secrets, tokens, cookies, or other sensitive auth material in SDP documents.
