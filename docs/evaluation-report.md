# Evaluation Report

## Scope

This report evaluates the current SpecResearch Loop implementation as a
research-specification workflow. It distinguishes engineering validation from
research-quality evaluation: a passing API or UI test confirms that the
workflow preserves data and provenance; it does not prove a research claim.

## System Under Test

- Web client: Next.js 15 and TypeScript.
- API: FastAPI, Pydantic, SQLite, and Docker Compose.
- AI mode: configurable OpenAI-compatible provider or deterministic fallback.
- Evidence model: a claim is only marked `SUPPORTED` after a researcher saves a
  source URL, reviewed passage, and verdict.

## Baselines

| Baseline             | Description                                                                                                                              | What it omits                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Template baseline    | Input-specific deterministic decomposition without a live LLM.                                                                           | Source search, persisted evidence review, Judge reruns, and revision history. |
| LLM planner baseline | A configured planner produces a draft from the idea.                                                                                     | Human-reviewed evidence records and the evidence-gated compiled-spec checks.  |
| SpecResearch Loop    | Planner/fallback plus persisted related work, evidence, decisions, canonical spec compilation, five Judge roles, and versioned revision. | It does not claim automated full-text verification.                           |

## Evaluation Scenarios

| Use case                  | Target behavior                                                                     | Dataset record |
| ------------------------- | ----------------------------------------------------------------------------------- | -------------- |
| Urban flood early warning | Keep sparse-sensor assumptions, baseline, data split, and resource budget explicit. | `flood-risk`   |
| Academic paper extraction | Track unsupported statements through claim-evidence verdicts.                       | `paper-claims` |

The inputs are stored in [use-cases.json](../dataset/use-cases.json). A fair
comparison runs each baseline with the same idea, source set, resource profile,
and evaluation checklist.

## Proposed Mechanism

The project mechanism is the **Evidence-Gated Specification Compiler**:

1. It compiles the latest project version with persisted related-work records,
   evidence records, and user decisions into fourteen spec sections.
2. It exposes each section as `READY`, `NEEDS_INPUT`, or `WARNING` and lists
   blockers instead of treating a generated draft as complete.
3. It uses the canonical compiled spec for Judge execution and revision input.
4. It retains provenance through `spec_version`, decision timestamps, evidence
   record IDs, and `spec_version_used` for every Judge run.

This mechanism is intended to reduce unsupported claims by making absent or
conflicting evidence visible before final confirmation. The hypothesis must be
tested with the metrics below; no research-performance improvement is claimed
by this engineering report.

## Metrics

| Metric                    | Measurement                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Evidence support rate     | Supported evidence records with a non-empty reviewed passage divided by all `SUPPORTED` records. |
| Unresolved evidence count | Count of `INSUFFICIENT` evidence findings before final confirmation.                             |
| Conflict count            | Count of claims with both `SUPPORTED` and `CONTRADICTED` verdicts.                               |
| Gap traceability          | Whether the selected gap links to a persisted related-work limitation and a proposed test.       |
| Judge agreement           | Majority severity share returned by the latest independent Judge run.                            |
| Revision effort           | Number of versioned revisions and saved user decisions before confirmation.                      |
| Cost profile              | Estimated calls, tokens, time, VRAM, candidates, rounds, and evaluation samples.                 |

## Engineering Validation Results

Validation was run on 2026-08-25 in Docker Desktop.

| Check                     | Command                                                                                                                                                               | Result                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Backend acceptance flow   | `docker compose run --rm --no-deps --entrypoint sh api -c "cd /app && PYTHONPATH=/app uv run --no-project --with pytest --with httpx pytest tests/test_spec_flow.py"` | Passed: 3 tests.                                        |
| Frontend production build | `docker compose run --rm --no-deps web npm run build`                                                                                                                 | Passed: compile, typecheck, and static page generation. |

The API test covers analysis, the required Claim/Open question cards, detailed
resource estimate fields, saved interpretation and gap decisions, related-work
persistence, evidence ambiguity/conflict detection, compiled fourteen-section
specs, independent Judge provenance, consensus fields, revision, and diff.

## Research-Quality Result Status

No benchmark-quality result is reported yet. A result table should be completed
only after a researcher reviews real sources, supplies a task dataset and
baselines, runs the protocol, and preserves the resulting project IDs and
exports. This avoids treating LLM-generated text or Crossref metadata as
verified empirical evidence.

## Reproduction Procedure

1. Start Docker Desktop and run `docker compose up --build`.
2. Use `flood-risk` or `paper-claims` from the dataset.
3. Confirm the Step 1 interpretation and save a related-work source with a
   limitation in Step 3.
4. Add evidence records, including a reviewed passage and verdict.
5. Save a gap in Step 4, inspect the compiled spec in Step 8, run Judges in
   Step 9, revise in Step 10, and export the final Markdown.
6. Record the metrics above for each baseline under the same resource profile.
