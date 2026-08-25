# Evaluation Protocol

## Baselines

1. **Template baseline**: deterministic input-specific decomposition without an LLM provider.
2. **LLM planner baseline**: configured OpenAI-compatible model without manually stored evidence records.

## Proposed workflow

The full workflow combines planner output, persisted source/evidence records, five independent Judge roles, latest-spec reruns, and user revision decisions.

## Metrics

- Percentage of claim-evidence records labelled `SUPPORTED` only when a passage is stored.
- Number of unresolved `INSUFFICIENT` records before final publication.
- Major/minor Judge issues by version.
- Number of user decisions and revisions required to reach final confirmation.
- Latency, LLM calls, and token budget from the feasibility plan.

## Demo procedure

1. Run `docker compose up -d --build`.
2. Select one record from `dataset/use-cases.json` and create a workspace.
3. Add a source and quoted passage in Step 3.
4. Save a Gap choice in Step 4, rerun Judges in Step 9, then revise in Step 10.
5. Confirm the final spec and inspect the saved decision log and version diff.
