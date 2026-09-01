# Architecture Overview

## Components

- Web client (Next.js): collects user inputs, displays decomposition cards, spec draft, and judge feedback.
- API service (FastAPI): orchestrates planning, source/evidence records,
  canonical specification compilation, versioning, and independent Judge runs.
- Docker Compose: runs both services with shared env settings.

## Request flow

1. User submits research idea from web.
2. Web calls API `/api/v1/spec/analyze`.
3. API returns:
   - Reinterpreted idea
   - Decomposition cards
   - Draft spec
   - Judge feedback
4. User confirms or edits the interpretation; clarification answers are saved as
   user decisions before decomposition.
5. Sources, related-work annotations, and evidence are persisted. Evidence uses
   `SUPPORTED`, `CONTRADICTED`, or `INSUFFICIENT` verdicts.
6. The compiled-spec endpoint creates a fourteen-section canonical spec from
   latest version, sources, evidence, decisions, and the resource profile.
7. Every Judge run resolves the latest persisted version, compiles canonical
   context, evaluates it independently, and records `spec_version_used`.
8. A revision receives the canonical spec, produces a new immutable version,
   and exposes a server-side diff.
9. Final publication is accepted only when the compiled specification has no
   blockers. The API stores an immutable Markdown snapshot with its published
   version and timestamp.

## Persistent state

- `projects`: original idea, target resource, current spec version, and
  workflow checkpoint.
- `spec_versions`: immutable draft snapshots and change logs.
- `decisions`: user choices including gap selection, revisions, and final publication.
- `evidence_records`: a source URL, quoted passage, target claim, and verification verdict.
- `related_work_records`: source metadata plus researcher-supplied approach and
  limitation annotations.
- `judge_runs`: Judge result, severity, provenance version, and stale status.
- `publications`: immutable canonical-spec snapshots keyed to the published
  version and timestamp.

## Correctness rules

- The API, not the browser, resolves the latest spec before Judge execution.
- The canonical compiled spec, not an arbitrary browser draft, is the context
  used for Judge execution and workflow revisions.
- A newer spec marks older completed Judge runs as `STALE`.
- Sources are never represented as verified unless a user or retrieval pipeline saves an evidence record.
- The consensus endpoint aggregates only completed Judge results for the latest spec version.
- Publication is idempotent for the same current version and rejects compiled
  specs with unresolved blockers. A subsequent decision, evidence record,
  related-work record, or revision returns the project to `ACTIVE`.

## Extensibility points

- `app/services/agent_runtime.py`
  - OpenAI-compatible provider adapter for Planner, Revision Agent, and Judges.
- `app/services/specloop_service.py`
  - Input-specific safe fallback when a provider response is unavailable or invalid.
- Frontend `lib/api.ts`
  - Add auth headers, retries, tracing.
