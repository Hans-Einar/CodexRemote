# Implementation Strategy

**Status:** Draft v0.1  
**Date:** 2026-04-01  
**Source:** `SDP/06--Design/`

## 1) Purpose
Define how CodexRemote should move from design into implementation.

## 2) Method
CodexRemote uses:

- horizontal design in `SDP/06--Design`
- vertical implementation slices in `SDP/07--Implementation`

Each sprint should cut across the minimum set of layers needed to produce a coherent increment:

- bridge adapter
- local API
- canonical session model
- workspace support when relevant
- web UI

## 3) Continuous Integration Rule
Each sprint should leave the repository locally runnable or otherwise locally verifiable for the scope it introduces.

## 4) Allowed Exceptions
A sprint may lean heavily toward one layer when discovery or integration risk demands it, but it should still leave behind a coherent and documented increment.

## 5) Sprint Order

1. `Sprint-001--DiscoveryAndBridgeSlice`
2. `Sprint-002--ThreadReadAndWorkspaceSlice`
3. `Sprint-003--ConversationAndPreviewSlice`
4. `Sprint-004A--ProjectRegistryAndPersistenceSlice`
5. `Sprint-004--ModeBAttachmentAndLiveUpdatesSlice`
6. `Sprint-005--FallbackAndHardeningSlice`
