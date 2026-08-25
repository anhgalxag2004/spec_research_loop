from typing import Literal

from pydantic import BaseModel, Field


CardStatus = Literal[
    "CONFIRMED",
    "PROPOSED",
    "MISSING",
    "AMBIGUOUS",
    "UNSUPPORTED",
    "CONFLICT",
]


class ResearchInput(BaseModel):
    idea: str = Field(min_length=20, max_length=3000)
    target_resource: str = Field(default="RTX 3090")


class SpecCard(BaseModel):
    type: str
    content: str
    status: CardStatus


class JudgeFeedback(BaseModel):
    judge: str
    severity: Literal["MINOR", "MAJOR"]
    issue: str
    rationale: str
    recommendation: str


class AgentRuntime(BaseModel):
    provider: str
    model: str
    mode: Literal["mock", "live"]
    roles: list[str]


class JudgeRun(BaseModel):
    judge: str
    spec_version_used: int
    status: Literal["COMPLETED", "STALE"]
    severity: Literal["MINOR", "MAJOR"]


class JudgeExecutionResponse(BaseModel):
    project_id: str
    spec_version_used: int
    judges: list[JudgeFeedback]
    judge_runs: list[JudgeRun]
    readiness_score: int
    agent_runtime: AgentRuntime


class RelatedWorkItem(BaseModel):
    title: str
    year: int
    url: str
    approach: str
    limitation: str


class ClaimEvidenceItem(BaseModel):
    claim: str
    baseline: str
    metric: str
    evidence_needed: str
    falsification: str
    verification: Literal["SUPPORTED", "CONTRADICTED", "INSUFFICIENT"] = "INSUFFICIENT"
    verification_rationale: str = "Evidence has not been independently verified yet."


class ExperimentPlan(BaseModel):
    experiment: str
    purpose: str
    setup: list[str]


class ComputeBudget(BaseModel):
    target_resource: str
    estimated_hours: float
    estimated_llm_calls: int
    estimated_token_budget: int
    recommendation: str


class ResearchPlan(BaseModel):
    interpreted_idea: str = Field(min_length=20)
    cards: list[SpecCard] = Field(min_length=4, max_length=10)
    related_work: list[RelatedWorkItem] = Field(max_length=8)
    claim_evidence: list[ClaimEvidenceItem] = Field(min_length=1, max_length=6)
    experiment_plan: list[ExperimentPlan] = Field(min_length=1, max_length=5)
    draft_spec: str = Field(min_length=80)


class AnalyzeResponse(BaseModel):
    project_id: str
    created_at: str
    input_idea: str
    interpreted_idea: str
    cards: list[SpecCard]
    related_work: list[RelatedWorkItem]
    claim_evidence: list[ClaimEvidenceItem]
    experiment_plan: list[ExperimentPlan]
    compute_budget: ComputeBudget
    draft_spec: str
    judges: list[JudgeFeedback]
    readiness_score: int
    version: int
    agent_runtime: AgentRuntime
    judge_runs: list[JudgeRun]


class ReviseRequest(BaseModel):
    project_id: str
    draft_spec: str = Field(min_length=20)
    strategy: Literal[
        "NARROW_CLAIM",
        "EXPAND_EXPERIMENT",
        "TURN_INTO_QUESTION",
        "CUSTOM",
    ]
    custom_note: str | None = None


class ReviseResponse(BaseModel):
    project_id: str
    revised_spec: str
    change_log: list[str]
    diff_summary: list[str]
    judges: list[JudgeFeedback]
    readiness_score: int
    version: int
    agent_runtime: AgentRuntime
    judge_runs: list[JudgeRun]


class VersionHistoryItem(BaseModel):
    version: int
    change_log: list[str]
    readiness_score: int
    created_at: str


class DecisionRequest(BaseModel):
    decision_type: str = Field(min_length=3, max_length=80)
    value: str = Field(min_length=3, max_length=3000)


class DecisionRecord(DecisionRequest):
    spec_version: int
    created_at: str


class EvidenceRequest(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    url: str = Field(min_length=8, max_length=2000)
    claim: str = Field(min_length=3, max_length=3000)
    passage: str = Field(min_length=3, max_length=6000)
    verdict: Literal["SUPPORTED", "CONTRADICTED", "INSUFFICIENT"]


class EvidenceRecord(EvidenceRequest):
    id: str
    spec_version: int
    created_at: str


class JudgeConsensus(BaseModel):
    project_id: str
    spec_version_used: int
    judge_count: int
    major_count: int
    minor_count: int
    consensus: str
    disagreements: list[str]


class VersionDiff(BaseModel):
    project_id: str
    from_version: int
    to_version: int
    diff_lines: list[str]
