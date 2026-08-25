from app.schemas import (
    ClaimEvidenceItem,
    ComputeBudget,
    ExperimentPlan,
    JudgeFeedback,
    RelatedWorkItem,
    ReviseRequest,
    SpecCard,
)


def reinterpret_idea(idea: str) -> str:
    return f"The proposed research investigates a testable solution for: {idea.strip()}"


def decompose_idea(idea: str, target_resource: str) -> list[SpecCard]:
    return [
        SpecCard(
            type="Problem",
            content=f"The input idea identifies a problem that needs a measurable solution: {idea.strip()}",
            status="PROPOSED",
        ),
        SpecCard(
            type="Research question",
            content="Does the proposed approach improve the target outcome compared with a defined baseline under the same resource constraints?",
            status="PROPOSED",
        ),
        SpecCard(
            type="Gap candidate",
            content="The specific limitation in existing methods must be verified from related work before this gap is confirmed.",
            status="PROPOSED",
        ),
        SpecCard(
            type="Contribution",
            content=f"A research contribution directly addressing the submitted idea: {idea.strip()}",
            status="PROPOSED",
        ),
        SpecCard(
            type="Evidence",
            content="A held-out evaluation set, baseline comparison, and metric defined for the submitted research objective.",
            status="MISSING",
        ),
        SpecCard(
            type="Constraint",
            content=f"Must run within {target_resource} budget.",
            status="CONFIRMED",
        ),
    ]


def build_draft_spec(idea: str, cards: list[SpecCard]) -> str:
    card_lines = "\n".join([f"- {card.type}: {card.content}" for card in cards])
    return (
        "# Research Specification Draft\n\n"
        f"## Input idea\n{idea}\n\n"
        "## Decomposition\n"
        f"{card_lines}\n\n"
        "## Experimental protocol\n"
        "1. Compare baseline prompts versus proposed loop optimization.\n"
        "2. Track unsupported claim rate, contradiction rate, and token cost.\n"
        "3. Run ablation on claim decomposition and evidence verifier.\n"
        "4. Validate generalization on unseen papers.\n"
    )


def build_related_work() -> list[RelatedWorkItem]:
    return []


def build_claim_evidence(idea: str) -> list[ClaimEvidenceItem]:
    return [
        ClaimEvidenceItem(claim=f"The proposed approach improves the target outcome for: {idea.strip()}", baseline="A current standard or no-intervention baseline selected by the researcher", metric="Primary outcome metric defined before evaluation", evidence_needed="A held-out dataset with a pre-registered evaluation protocol", falsification="The proposed approach does not improve the primary metric against the baseline."),
    ]


def build_experiment_plan(idea: str) -> list[ExperimentPlan]:
    return [
        ExperimentPlan(experiment="Baseline comparison", purpose=f"Measure whether the proposed solution improves the outcome for: {idea.strip()}", setup=["Use the same dataset, resource budget, and evaluation protocol for every method", "Compare against a defined baseline", "Report the primary metric and resource cost"]),
        ExperimentPlan(experiment="Ablation", purpose="Identify which proposed component contributes to the outcome.", setup=["Remove one component at a time", "Keep all other conditions fixed", "Report changes in the primary metric"]),
    ]


def estimate_compute_budget(target_resource: str) -> ComputeBudget:
    return ComputeBudget(target_resource=target_resource, estimated_hours=7.5, estimated_llm_calls=3000, estimated_token_budget=1_200_000, recommendation="Start with 5 seed prompts, 10 candidates, 10 rounds, 50 development samples, and fully evaluate only the top 5 candidates.")


def run_mock_judges() -> list[JudgeFeedback]:
    return [
        JudgeFeedback(
            judge="Research Gap Judge",
            severity="MAJOR",
            issue="The research gap needs verified related-work citations before it can be confirmed.",
            rationale="Without direct references, novelty claims remain weak.",
            recommendation="Attach at least 3 papers and map each to specific limitations.",
        ),
        JudgeFeedback(
            judge="Contribution Judge",
            severity="MINOR",
            issue="Contribution is clear but may overlap with existing loop optimizers.",
            rationale="Need explicit distinction at claim-evidence granularity.",
            recommendation="Add a dedicated section on claim-level feedback mechanism.",
        ),
        JudgeFeedback(
            judge="Experiment Judge",
            severity="MAJOR",
            issue="Current draft lacks full ablation dimensions.",
            rationale="Cannot isolate which component drives improvement.",
            recommendation="Include ablation for verifier, feedback text, and candidate diversity.",
        ),
        JudgeFeedback(
            judge="Evidence Judge",
            severity="MAJOR",
            issue="No citation verification mechanism is defined.",
            rationale="Evidence support cannot be trusted without citation checks.",
            recommendation="Add retrieval + quote alignment checks per claim.",
        ),
        JudgeFeedback(
            judge="Conference Readiness Judge",
            severity="MINOR",
            issue="Soundness is fair but reproducibility details are incomplete.",
            rationale="Seed control and split strategy are not stated.",
            recommendation="Specify random seeds, data splits, and compute budget table.",
        ),
    ]


def revise_spec(payload: ReviseRequest) -> tuple[str, list[str]]:
    changes: list[str] = []
    revised = payload.draft_spec

    if payload.strategy == "NARROW_CLAIM":
        revised += "\n\n## Revision\nScope narrowed to scientific-paper domain only."
        changes.append("Narrowed generalization claim to one validated domain.")
    elif payload.strategy == "EXPAND_EXPERIMENT":
        revised += "\n\n## Revision\nAdded cross-domain experiments for finance and real-estate documents."
        changes.append("Expanded experiment matrix with two additional domains.")
    elif payload.strategy == "TURN_INTO_QUESTION":
        revised += "\n\n## Revision\nGeneralization is now treated as an open research question."
        changes.append("Converted broad claim into a research question.")
    else:
        note = payload.custom_note or "User-defined revision."
        revised += f"\n\n## Revision\n{note}"
        changes.append("Applied custom revision note from user.")

    return revised, changes


def readiness_score(judges: list[JudgeFeedback]) -> int:
    major_count = sum(judge.severity == "MAJOR" for judge in judges)
    return max(35, 82 - major_count * 12)
