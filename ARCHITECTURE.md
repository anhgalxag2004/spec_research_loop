# Architecture Overview

## Components

- Web client (Next.js): collects user inputs, displays decomposition cards, spec draft, and judge feedback.
- API service (FastAPI): orchestrates LLM planning, evidence records, versioning, and independent Judge runs.
- Docker Compose: runs both services with shared env settings.

## Request flow

1. User submits research idea from web.
2. Web calls API `/api/v1/spec/analyze`.
3. API returns:
   - Reinterpreted idea
   - Decomposition cards
   - Draft spec
   - Judge feedback
4. User chooses revision strategy and calls `/api/v1/spec/revise`.
5. API returns updated draft and change log.
6. Sources and evidence are persisted with a verdict of `SUPPORTED`, `CONTRADICTED`, or `INSUFFICIENT`.
7. Every Judge run resolves the latest persisted spec and records `spec_version_used`.

## Persistent state

- `projects`: original idea, current spec version, and workflow checkpoint.
- `spec_versions`: immutable draft snapshots and change logs.
- `decisions`: user choices including gap selection, revisions, and final publication.
- `evidence_records`: a source URL, quoted passage, target claim, and verification verdict.
- `judge_runs`: Judge result, severity, provenance version, and stale status.

## Correctness rules

- The API, not the browser, resolves the latest spec before Judge execution.
- A newer spec marks older completed Judge runs as `STALE`.
- Sources are never represented as verified unless a user or retrieval pipeline saves an evidence record.
- The consensus endpoint aggregates only completed Judge results for the latest spec version.

## Extensibility points

- `app/services/agent_runtime.py`
  - OpenAI-compatible provider adapter for Planner, Revision Agent, and Judges.
- `app/services/specloop_service.py`
  - Input-specific safe fallback when a provider response is unavailable or invalid.
- Frontend `lib/api.ts`
  - Add auth headers, retries, tracing.
