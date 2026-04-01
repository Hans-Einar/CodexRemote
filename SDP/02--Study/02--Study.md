# Study - Baseline and Feasibility Questions

**Status:** Draft v0.1  
**Date:** 2026-04-01  
**Primary source:** `SDP/01--Mandate/01--Mandate.md`

## 1) Purpose
Capture the current repository baseline and the main feasibility questions that must be answered before implementation starts in earnest.

## 2) Current Repository Baseline
The repository currently contains:

- the initial mandate document
- a concept image in the repository root
- no application source tree yet
- no committed bridge, server, or UI implementation

This means the next work is architecture and integration validation, not refactoring existing product code.

## 3) Primary Unknown
The main unknown is whether a local browser companion can attach to the same live Codex work surface already used by Codex Desktop or the VS Code extension.

This Mode B question dominates the study phase because it determines:

- whether live session attachment is possible
- which identifiers the system can trust
- whether updates can stream or must be polled
- how authentication can be reused safely

## 4) Study Tracks

### 4.1 App-server protocol
Study:

- available transport options
- thread and session identifiers
- request and response shape
- event or streaming behavior

### 4.2 Authentication reuse
Study:

- whether existing desktop login state can be reused
- what the bridge is allowed to access locally
- what secret material must never be persisted

### 4.3 Session and thread sync
Study:

- how desktop and VS Code share or mirror work
- how a workspace maps to a thread or session
- whether attachment is direct, mirrored, or impossible

### 4.4 Workspace access
Study:

- how the browser companion should discover the active workspace root
- whether the bridge should remain read-only in the first scope
- how markdown and text files should be decoded safely

### 4.5 Live updates
Study:

- whether the local integration surface exposes subscriptions
- what polling strategy is acceptable if subscriptions are unavailable
- how partial assistant output is represented, if at all

## 5) Initial Direction
Even before protocol validation is complete, the repository should assume:

- Mode B is primary and must be tested first
- a Node bridge should isolate protocol-specific details from the web UI
- workspace access should start read-only
- the web client should support both event-driven and polling-based updates
- Mode A fallback should remain available behind the same bridge surface

## 6) Study Outcome
At this stage, no technical feasibility evidence has yet been captured inside the repository beyond the mandate assumptions.

The next authoritative outputs are:

- `SDP/03--Requirements/03--Requirements.md`
- `SDP/04--Architecture/04--Architecture.md`
- the design-analysis documents in `SDP/05--DesignAnalysis`
