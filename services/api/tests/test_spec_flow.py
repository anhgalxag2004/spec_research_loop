from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.storage import initialize_database


initialize_database()
settings.llm_provider = "mock"
client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_analyze_and_revise() -> None:
    analyze = client.post(
        "/api/v1/spec/analyze",
        json={
            "idea": "Build a multi-round prompt optimization loop to reduce hallucination in paper extraction with claim-evidence verification.",
            "target_resource": "RTX 3090",
        },
    )
    assert analyze.status_code == 200
    analyze_payload = analyze.json()
    assert len(analyze_payload["cards"]) >= 5
    assert analyze_payload["judge_runs"][0]["spec_version_used"] == 1

    revise = client.post(
        "/api/v1/spec/revise",
        json={
            "project_id": analyze_payload["project_id"],
            "draft_spec": analyze_payload["draft_spec"],
            "strategy": "NARROW_CLAIM",
        },
    )
    assert revise.status_code == 200
    revise_payload = revise.json()
    assert "Scope narrowed" in revise_payload["revised_spec"]
    assert len(revise_payload["change_log"]) == 1
    assert revise_payload["version"] == 2
    assert all(run["spec_version_used"] == 2 for run in revise_payload["judge_runs"])

    rerun = client.post(f"/api/v1/spec/{analyze_payload['project_id']}/judges/run")
    assert rerun.status_code == 200
    rerun_payload = rerun.json()
    assert rerun_payload["spec_version_used"] == 2
    assert all(run["spec_version_used"] == 2 for run in rerun_payload["judge_runs"])


def test_project_evidence_decisions_consensus_and_diff() -> None:
    analyze = client.post(
        "/api/v1/spec/analyze",
        json={
            "idea": "Build an early-warning system that predicts urban flood risk from rainfall, river level, and terrain data.",
            "target_resource": "RTX 3090",
        },
    )
    project_id = analyze.json()["project_id"]

    decision = client.post(
        f"/api/v1/spec/{project_id}/decisions",
        json={"decision_type": "RESEARCH_GAP", "value": "Focus on sparse-sensor urban flood prediction."},
    )
    assert decision.status_code == 200

    evidence = client.post(
        f"/api/v1/spec/{project_id}/evidence",
        json={
            "title": "Urban flood forecasting study",
            "url": "https://example.org/flood-study",
            "claim": "Sparse-sensor flood prediction remains under-evaluated.",
            "passage": "The study reports limited evaluation in sparse-sensor settings.",
            "verdict": "SUPPORTED",
        },
    )
    assert evidence.status_code == 200
    assert evidence.json()["verdict"] == "SUPPORTED"

    consensus = client.get(f"/api/v1/spec/{project_id}/consensus")
    assert consensus.status_code == 200
    assert consensus.json()["judge_count"] == 5

    revise = client.post(
        "/api/v1/spec/revise",
        json={
            "project_id": project_id,
            "draft_spec": analyze.json()["draft_spec"],
            "strategy": "NARROW_CLAIM",
        },
    )
    diff = client.get(f"/api/v1/spec/{project_id}/diff?from_version=1&to_version=2")
    assert revise.status_code == 200
    assert diff.status_code == 200
    assert diff.json()["to_version"] == 2
