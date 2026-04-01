# Implementation Plan - Workspace and Markdown

## Goal
Implement safe, read-only workspace browsing and markdown preview support.

## Planned Work

- resolve and guard the active workspace root
- list directories and read text files safely
- provide markdown content and metadata to the UI

## Exit Criteria

- workspace tree can be browsed
- markdown files can be previewed
- path traversal outside the project root is blocked
