# Implementation Plan - Session and Thread Sync

## Goal
Implement the canonical model for workspace, session, thread, and attachment state.

## Planned Work

- define canonical identifiers and DTOs
- model attachability and fallback status explicitly
- reconcile adapter data into UI-safe session and thread shapes

## Exit Criteria

- canonical contracts exist
- Mode B versus Mode A state is explicit
- thread selection can survive a reload when identifiers allow it
