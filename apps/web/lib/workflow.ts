import type { DecisionRecord } from "@/lib/api";

export const LAST_WORKFLOW_STAGE = 10;

export function stepConfirmationType(stage: number): string {
  return `STEP_${stage}_CONFIRMED`;
}

export function getHighestAccessibleStage(decisions: DecisionRecord[]): number {
  const decisionTypes = new Set(
    decisions.map((decision) => decision.decision_type),
  );

  if (!decisionTypes.has("IDEA_INTERPRETATION")) return 1;

  let accessibleStage = 2;
  for (
    let completedStage = 2;
    completedStage < LAST_WORKFLOW_STAGE;
    completedStage += 1
  ) {
    if (!decisionTypes.has(stepConfirmationType(completedStage))) break;
    accessibleStage = completedStage + 1;
  }
  return accessibleStage;
}

export function getWorkflowPath(stage: number): string {
  return stage <= 1 ? "/" : `/step/${stage}`;
}

export function canAccessFinalSpec(decisions: DecisionRecord[]): boolean {
  return decisions.some(
    (decision) => decision.decision_type === stepConfirmationType(10),
  );
}
