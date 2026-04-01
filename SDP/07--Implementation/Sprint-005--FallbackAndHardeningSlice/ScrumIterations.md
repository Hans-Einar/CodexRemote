# Scrum Iterations

## Iteration 001
- Status: planned
- Scrum meeting note:
  - Sprint 005 is the hardening pass that turns the earlier slices into a dependable local baseline.
  - This iteration starts with fallback lifecycle completion because the product must remain usable when Mode B attach is unavailable.
- Objective:
  - define and complete the Mode A fallback lifecycle so the system remains operational under attachment failure or limitation
- Entry criteria:
  - Sprint 004 has defined the attachment and degraded-state model
  - the bridge and UI already support the primary read and send flows
- Target deliverables:
  - explicit fallback thread lifecycle rules
  - clear fallback labeling and selection behavior
  - defined transition rules from failed attach attempts into fallback use
- Sprint phases touched:
  - Phase 1 - Fallback Thread Lifecycle Completion
- Detailed TODO:
  - [ ] Define fallback thread creation behavior.
  - [ ] Define fallback thread selection behavior.
  - [ ] Define fallback thread labeling in the UI.
  - [ ] Ensure conversation read works in fallback mode.
  - [ ] Ensure prompt send works in fallback mode.
  - [ ] Define how failed attach attempts transition into fallback behavior.
  - [ ] Define any restrictions that must remain visible while operating in fallback mode.
  - [ ] Record unresolved fallback-ownership questions explicitly.
- Verification plan:
  - verify the fallback lifecycle is specific enough to implement without hidden assumptions
  - verify fallback remains visibly distinct from attached or mirrored work
  - verify downstream hardening work can build on a stable fallback definition
- Expected handoff-ready state:
  - Sprint 005 Iteration 002 can focus on runtime safety and configuration hardening rather than fallback semantics

## Iteration 002
- Status: planned
- Scrum meeting note:
  - Terminal support is now part of the local operator baseline.
- Objective:
  - add and harden an in-app PowerShell terminal backed by local process management
- Target deliverables:
  - browser terminal surface
  - local terminal-session management
  - explicit local-only operational guardrails
