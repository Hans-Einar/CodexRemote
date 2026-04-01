# Software Development Process and Standard Document Procedure

**Status:** Working draft v0.1  
**Date:** 2026-04-01  
**Audience:** agents first, humans second

## 1) Purpose
Define how work should be documented, planned, implemented, reviewed, and handed off in this repository.

This repository currently starts from mandate-first documentation rather than an existing codebase.  
The SDP folder is therefore the shared planning surface for future implementation work.

## 2) Core Principles

- Keep one authoritative description of the active scope at a time.
- Document scope before or during implementation, not only after it.
- Treat Mode B live-thread attachment as the primary product question until disproven.
- Keep the local Codex integration boundary separate from workspace access and UI logic.
- Keep auth handling local and avoid persisting secret material in repository documents.
- Prefer explicit fallback behavior over hidden degraded behavior.

## 3) Standard Document Procedure
The baseline project memory is organized into:

- `01--Mandate`
- `02--Study`
- `03--Requirements`
- `04--Architecture`
- `05--DesignAnalysis`
- `06--Design`
- `07--Implementation`
- `Refactor`
- `Sprints`
- `CodeReview`
- `Instructions`

The numbered folders separate three concerns:

- `05--DesignAnalysis`: tradeoffs, unknowns, and hardening work
- `06--Design`: the authoritative chosen design
- `07--Implementation`: ordered implementation slices and sprint execution

`Refactor` captures later architecture or scope shifts when earlier assumptions stop fitting the repository.

## 4) Working Sequence
Normal working sequence:

1. identify the active authoritative folder and document
2. restate scope, non-goals, and expected output
3. update the relevant SDP document before broad code changes
4. implement the scoped work
5. verify locally
6. record completed work in `implementationNotes.md`

## 5) Refactor Tracks
When a refactor is needed:

- create a numbered folder in `SDP/Refactor`
- keep the folder self-contained
- treat that folder as the execution boundary for that change

Each refactor folder should normally contain:

- `01--mandate.md`
- `02--study.md`
- `03--design.md`
- `implementationPlan.md`
- `implementationNotes.md`

Optional later additions:

- sprint subfolders
- `ScrumIterations.md`
- `Handoff.md`
- migration notes
- regression scenarios

## 6) Sprint Discipline
Sprints are the execution slices used after the work has moved from broad planning into iterative delivery.

Each sprint folder should normally contain:

- `Sprint-XXX--Name.md`
- `ScrumIterations.md`
- `implementationNotes.md`
- `Handoff.md` when needed

Use sprints when:

- implementation is expected to span several iterations
- the active refactor or feature has multiple independently testable slices
- several agents or sessions are likely to contribute

### 6.1 Scrum iterations versus sprint phases
Scrum iterations are the fine-grained execution surface.  
They do not need to map one-to-one to sprint phases.

Use `ScrumIterations.md` to record:

- the scrum meeting note
- which parts of the sprint are active in this iteration
- any newly discovered fixes or follow-up ideas
- the concrete TODO list for the iteration

The sprint document should stay high-level.  
`ScrumIterations.md` is where detailed iteration scope is agreed and tracked.

## 7) Handoffs
Handoffs should leave durable context in the repository, not only in chat history.

When handoff becomes necessary:

- update the active plan documents first
- create or update local `Handoff.md`
- record exact next step, open questions, verification state, and worktree notes

Detailed instructions live in `SDP/Instructions/HandoffProcess.md`.

## 8) How Agents Should Use SDP Here
For this repository, agents should usually load context in this order:

1. `AGENTS.md`
2. `SDP/AGENT-REMINDERS.md`
3. `SDP/Instructions/SoftwareDevelopmentProcess.md`
4. the active phase or design documents
5. the active sprint or refactor documents
6. the active implementation notes
7. local `Handoff.md`, if present

## 9) Project-Specific Guidance
CodexRemote has four boundaries that must stay explicit:

- local Codex integration
- canonical session and thread model
- workspace access
- browser UI

Changes that blur those boundaries should be treated as architectural risk and documented before implementation.

Additional local rules:

- bind network services to localhost by default
- keep workspace access read-only until design documents expand scope
- do not describe fallback threads as attached live threads

## 10) Living Document Rule
If a repeated failure mode appears, add the rule here in concrete form.  
This document is expected to evolve with the repository.
