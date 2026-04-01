# Handoff Process

## 1) Purpose
Define how to hand off active work between agents without losing repository-specific context.

## 2) When To Create A Local Handoff
Create `Handoff.md` in the active sprint or refactor folder when:

- the task will likely continue in another session
- scope is non-trivial and easy to misunderstand without local notes
- verification is partial or pending
- the next step depends on nuanced local protocol or workspace context

## 3) Handoff Order

1. update the authoritative SDP documents first
2. record current status in `implementationNotes.md` if work is complete and verified
3. create or update local `Handoff.md`
4. hand off only the folder that owns the work

## 4) What The Handoff Must Contain

- current objective
- authoritative source documents
- what is done
- what is not done
- exact next step
- verification already completed
- open risks or ambiguities
- worktree notes if they matter

## 5) Locality Rule
Keep handoff files close to the work they describe.  
Do not create one global handoff file for unrelated work streams.

## 6) Sensitive Material Rule
Do not place tokens, cookies, or copied secret material in handoff files.

## 7) Template
Use `SDP/Instructions/HandoffTemplate.md` when creating a new local `Handoff.md`.
