# Prompt Catalogue

## Research Planner and Evidence Verifier

Role: create a testable research plan from the submitted idea.

Required JSON: `interpreted_idea`, decomposition cards, `related_work`, claim-evidence records, experiment plan, and draft spec.

Guardrail: no source is asserted as verified unless evidence was supplied by the user or retrieval system. Unsupported claims use `INSUFFICIENT`.

## Independent Judges

Five roles run separately on the latest spec: Research Gap, Contribution, Experiment, Evidence, and Conference Readiness.

Each returns severity, issue, rationale, and recommendation. The server records the exact `spec_version_used`.

## Revision Agent

Input: latest draft, a user-selected revision strategy, and an optional note.

Output: a changed spec plus a non-empty change log. A no-op output is rejected and replaced by a deterministic strategy-specific revision.
