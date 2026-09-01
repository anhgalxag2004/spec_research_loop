# Sample Research Specification: Urban Flood Early Warning

This sample demonstrates the structure exported by SpecResearch Loop for the
`flood-risk` use case. It is intentionally transparent about evidence that has
not been reviewed; it is a complete planning artifact, not a claim that flood
prediction performance has been established.

## 1. Problem statement

Develop an early-warning system that predicts urban flood risk from rainfall,
river level, and terrain data under a stated resource budget.

## 2. Research questions

Can a sparse-sensor prediction approach improve a pre-registered flood-risk
metric against a matched baseline using the same data split and resource budget?

## 3. Related-work matrix

| Source                                        | Approach                               | Limitation                                      | Evidence state                    |
| --------------------------------------------- | -------------------------------------- | ----------------------------------------------- | --------------------------------- |
| To be selected through Crossref/manual review | Record the method after source review. | Record a limitation relevant to sparse sensors. | No reviewed passage supplied yet. |

## 4. Research gap

The selected gap must be linked to a specific limitation from persisted related
work. A valid gap is not inferred merely because no identical paper was found.

## 5. Proposed approach

Evaluate a flood-risk model that combines rainfall, river-level, and terrain
features while explicitly testing robustness under reduced sensor coverage.

## 6. Expected contributions

- A clearly scoped sparse-sensor flood-risk prediction workflow.
- A reproducible protocol comparing the proposed method with matched baselines.
- An evidence-aware specification that labels unsupported assumptions before
  publication.

## 7. Claim-evidence matrix

| Claim                                                                                         | Baseline                                                                 | Metric                                    | Required evidence                                       | Falsification                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| The proposed approach improves a pre-defined flood-risk outcome under sparse sensor coverage. | Current standard or no-intervention baseline selected by the researcher. | Pre-registered primary prediction metric. | Held-out evaluation split and reviewed source evidence. | No stable improvement against the matched baseline. |

## 8. Experimental protocol

1. Fix train, development, validation, and held-out data splits before tuning.
2. Compare every method using the same input features, model budget, and
   evaluation conditions.
3. Report the primary metric, calibration/error analysis, latency, and cost.
4. Run component ablations and reduced-sensor scenarios.

## 9. Baselines and metrics

- Baselines: persistence/no-intervention predictor, a researcher-selected
  current standard, and an ablated version of the proposed model.
- Metrics: pre-registered prediction metric, false-alert rate, missed-event
  rate, calibration, latency, and resource cost.

## 10. Ablation plan

Remove terrain features, reduce sensor coverage, remove river-level features,
and compare each variant with all other evaluation conditions fixed.

## 11. Compute budget

- Target: RTX 3090.
- Model profile: 7B-8B equivalent planning profile, 4-bit where applicable.
- Seed configurations: 5; candidates per round: 10; rounds: 10.
- Development samples: 50; validation samples: 300; top candidates: 5.
- Reduction policy: reduce candidate count before reducing the held-out split.

## 12. Risks and limitations

- Crossref metadata does not verify a claim or a passage.
- Sparse-sensor coverage may vary by location and event type.
- Results should not be generalized outside the evaluated geography, data
  period, sensor density, and resource profile.

## 13. Open issues

- Select reviewed related-work sources and record limitations.
- Define the geographic scope, data source, time horizon, and primary metric.
- Save reviewed evidence passages and resolve any conflicting verdicts.

## 14. Decision history

The live application records each interpretation confirmation, card
confirmation, gap decision, revision strategy, and final publication decision
with its specification version and timestamp.
