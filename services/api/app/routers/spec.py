from fastapi import APIRouter, HTTPException

from app.schemas import (
    AnalyzeResponse,
    DecisionRecord,
    DecisionRequest,
    EvidenceRecord,
    EvidenceRequest,
    JudgeExecutionResponse,
    JudgeConsensus,
    ResearchInput,
    ReviseRequest,
    ReviseResponse,
    VersionDiff,
    VersionHistoryItem,
)
from app.services.agent_runtime import (
    generate_judges,
    generate_research_plan,
    generate_revision,
    runtime_metadata,
)
from app.services.specloop_service import (
    build_draft_spec,
    decompose_idea,
    build_claim_evidence,
    build_experiment_plan,
    build_related_work,
    estimate_compute_budget,
    reinterpret_idea,
    readiness_score,
    revise_spec,
    run_mock_judges,
)
from app.storage import (
    create_project,
    get_latest_spec,
    get_decisions,
    get_evidence,
    get_judge_consensus,
    get_project_history,
    get_version_diff,
    save_decision,
    save_evidence,
    save_judge_runs,
    save_revision,
    update_workflow_checkpoint,
)

router = APIRouter(prefix="/api/v1/spec", tags=["spec"])


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_research_idea(payload: ResearchInput) -> AnalyzeResponse:
    plan = generate_research_plan(payload.idea, payload.target_resource)
    cards = plan.cards if plan else decompose_idea(payload.idea, payload.target_resource)
    draft_spec = plan.draft_spec if plan else build_draft_spec(payload.idea, cards)
    judges = generate_judges(draft_spec) or run_mock_judges()
    score = readiness_score(judges)
    project_id, created_at = create_project(payload.idea, draft_spec, score)
    judge_runs = save_judge_runs(
        project_id,
        1,
        [judge.model_dump() for judge in judges],
    )
    update_workflow_checkpoint(project_id, 9)
    return AnalyzeResponse(
        project_id=project_id,
        created_at=created_at,
        input_idea=payload.idea,
        interpreted_idea=plan.interpreted_idea if plan else reinterpret_idea(payload.idea),
        cards=cards,
        related_work=plan.related_work if plan else build_related_work(),
        claim_evidence=plan.claim_evidence if plan else build_claim_evidence(payload.idea),
        experiment_plan=plan.experiment_plan if plan else build_experiment_plan(payload.idea),
        compute_budget=estimate_compute_budget(payload.target_resource),
        draft_spec=draft_spec,
        judges=judges,
        readiness_score=score,
        version=1,
        agent_runtime=runtime_metadata(),
        judge_runs=judge_runs,
    )


@router.post("/revise", response_model=ReviseResponse)
def revise_research_spec(payload: ReviseRequest) -> ReviseResponse:
    revised_spec, change_log = generate_revision(
        payload.draft_spec,
        payload.strategy,
        payload.custom_note,
    ) or revise_spec(payload)
    try:
        latest_spec = get_latest_spec(payload.project_id)
        save_decision(
            payload.project_id,
            int(latest_spec["version"]),
            payload.strategy,
            payload.custom_note or payload.strategy,
        )
        judges = generate_judges(revised_spec) or run_mock_judges()
        score = readiness_score(judges) + 5
        version = save_revision(payload.project_id, revised_spec, change_log, score)
        judge_runs = save_judge_runs(
            payload.project_id,
            version,
            [judge.model_dump() for judge in judges],
        )
        update_workflow_checkpoint(payload.project_id, 10)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return ReviseResponse(
        project_id=payload.project_id,
        revised_spec=revised_spec,
        change_log=change_log,
        diff_summary=change_log,
        judges=judges,
        readiness_score=score,
        version=version,
        agent_runtime=runtime_metadata(),
        judge_runs=judge_runs,
    )


@router.post("/{project_id}/judges/run", response_model=JudgeExecutionResponse)
def run_latest_spec_judges(project_id: str) -> JudgeExecutionResponse:
    try:
        latest_spec = get_latest_spec(project_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    judges = generate_judges(str(latest_spec["draft_spec"])) or run_mock_judges()
    version = int(latest_spec["version"])
    judge_runs = save_judge_runs(
        project_id,
        version,
        [judge.model_dump() for judge in judges],
    )
    update_workflow_checkpoint(project_id, 9)
    return JudgeExecutionResponse(
        project_id=project_id,
        spec_version_used=version,
        judges=judges,
        judge_runs=judge_runs,
        readiness_score=readiness_score(judges),
        agent_runtime=runtime_metadata(),
    )


@router.post("/{project_id}/decisions", response_model=DecisionRecord)
def record_user_decision(project_id: str, payload: DecisionRequest) -> DecisionRecord:
    try:
        latest_spec = get_latest_spec(project_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    version = int(latest_spec["version"])
    save_decision(project_id, version, payload.decision_type, payload.value)
    return DecisionRecord(
        spec_version=version,
        created_at=get_decisions(project_id)[0]["created_at"],
        **payload.model_dump(),
    )


@router.get("/{project_id}/decisions", response_model=list[DecisionRecord])
def project_decisions(project_id: str) -> list[DecisionRecord]:
    try:
        get_latest_spec(project_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return [DecisionRecord(**record) for record in get_decisions(project_id)]


@router.post("/{project_id}/evidence", response_model=EvidenceRecord)
def record_evidence(project_id: str, payload: EvidenceRequest) -> EvidenceRecord:
    try:
        latest_spec = get_latest_spec(project_id)
        record = save_evidence(project_id, int(latest_spec["version"]), payload.model_dump())
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return EvidenceRecord(**record)


@router.get("/{project_id}/evidence", response_model=list[EvidenceRecord])
def project_evidence(project_id: str) -> list[EvidenceRecord]:
    try:
        get_latest_spec(project_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return [EvidenceRecord(**record) for record in get_evidence(project_id)]


@router.get("/{project_id}/consensus", response_model=JudgeConsensus)
def project_judge_consensus(project_id: str) -> JudgeConsensus:
    try:
        return JudgeConsensus(**get_judge_consensus(project_id))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/{project_id}/diff", response_model=VersionDiff)
def project_version_diff(project_id: str, from_version: int, to_version: int) -> VersionDiff:
    try:
        return VersionDiff(**get_version_diff(project_id, from_version, to_version))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/{project_id}/history", response_model=list[VersionHistoryItem])
def project_version_history(project_id: str) -> list[VersionHistoryItem]:
    history = get_project_history(project_id)
    if not history:
        raise HTTPException(status_code=404, detail="Project does not exist.")
    return [VersionHistoryItem(**item) for item in history]
