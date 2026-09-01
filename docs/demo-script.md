# Demo Video Script

This is a reproducible script for recording the required website demo. It uses
the `flood-risk` example and takes approximately six to eight minutes.

## Before Recording

1. Start Docker Desktop.
2. Run `docker compose up --build`.
3. Open `http://localhost:3000` and `http://localhost:8000/docs` in separate
   browser tabs.
4. Use a clean browser session so the sequence begins without a workspace.

## Recording Sequence

| Time        | Screen and action              | What to say/show                                                                                                                                                                |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:00-00:30 | Home / Step 1                  | State the goal: turn a raw research idea into a versioned, evidence-aware research specification.                                                                               |
| 00:30-01:10 | Step 1 input and clarification | Enter the urban flood early-warning idea, choose clarification answers, edit or accept the interpretation, request another example, then confirm.                               |
| 01:10-01:45 | Step 2 decomposition           | Show Problem, Research question, Gap candidate, Contribution, Claim, Evidence, Constraint, and Open question cards. Confirm at least one card.                                  |
| 01:45-02:45 | Step 3 source management       | Search Crossref or enter a manual source. Save approach and limitation into the related-work matrix. Save a source URL, reviewed passage, claim, and evidence verdict.          |
| 02:45-03:20 | Step 4 gap                     | Show that the gap view cites saved limitations, evidence ambiguity/conflict findings, and a testable experiment. Select a gap direction or enter Other.                         |
| 03:20-04:05 | Steps 5-7                      | Show claim-evidence cards, the experiment plan, and the detailed resource profile: model, VRAM, candidates, rounds, samples, calls, tokens, and reduction advice.               |
| 04:05-04:45 | Step 8 compiled spec           | Show the fourteen sections, readiness labels, blockers, and the generated Markdown. Explain that unsupported or conflicting evidence prevents a misleading all-green checklist. |
| 04:45-05:30 | Step 9 Judge panel             | Run Judges. Show each role, its version provenance, agreement score, severity split, role findings, and consensus.                                                              |
| 05:30-06:20 | Step 10 revision               | Select a revision strategy or Other, apply it, then show the immediate server-side version diff.                                                                                |
| 06:20-07:00 | Final page                     | Show persisted decision log, version-specific final confirmation, compiled Markdown export, and the final readiness/blocker state.                                              |

## Capture Checklist

- Capture the browser URL bar once with `localhost:3000` visible.
- Capture API documentation once with `localhost:8000/docs` visible.
- Do not show API keys, `.env` contents, or personal account details.
- Capture at least one saved source, one evidence verdict, one user decision,
  one Judge rerun, one revision diff, and the Markdown export action.
- End with the final page and the current spec version visible.

## Suggested File Name

`spec-research-loop-demo.mp4`
