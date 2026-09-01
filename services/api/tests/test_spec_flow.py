import json
from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.services.specloop_service import (
    derive_scholarly_query,
    search_scholarly_sources,
)
from app.storage import initialize_database


initialize_database()
settings.llm_provider = "mock"
client = TestClient(app)


class JsonResponse(BytesIO):
    def __enter__(self) -> "JsonResponse":
        return self

    def __exit__(self, exception_type: object, exception: object, traceback: object) -> None:
        self.close()


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_openalex_search_returns_real_metadata_shape() -> None:
    assert (
        derive_scholarly_query(
            "Build an early-warning system that predicts urban flood risk from rainfall, river level, and terrain data."
        )
        == "urban flood prediction"
    )
    payload = {
        "results": [
            {
                "id": "https://openalex.org/W123",
                "display_name": "Data-driven flood emulation",
                "publication_year": 2020,
                "doi": "https://doi.org/10.1111/jfr3.12684",
                "authorships": [
                    {"author": {"display_name": "Zifeng Guo"}},
                    {"author": {"display_name": "João P. Leitão"}},
                ],
                "primary_location": {
                    "landing_page_url": "https://doi.org/10.1111/jfr3.12684",
                    "source": {"display_name": "Journal of Flood Risk Management"},
                },
                "cited_by_count": 224,
                "open_access": {"is_oa": True},
            }
        ]
    }
    with patch(
        "app.services.specloop_service.urlopen",
        return_value=JsonResponse(json.dumps(payload).encode()),
    ):
        sources = search_scholarly_sources("urban flood prediction")

    assert len(sources) == 1
    assert sources[0].url == "https://doi.org/10.1111/jfr3.12684"
    assert sources[0].source_provider == "OpenAlex"
    assert sources[0].cited_by_count == 224
    assert sources[0].is_open_access is True


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
    assert {"Claim", "Open question"}.issubset(
        {card["type"] for card in analyze_payload["cards"]},
    )
    assert analyze_payload["compute_budget"]["estimated_vram_gb"] > 0
    assert analyze_payload["compute_budget"]["candidates_per_round"] > 0
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
    assert "Scope is limited" in revise_payload["revised_spec"]
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

    blocked_publish = client.post(f"/api/v1/spec/{project_id}/publish")
    assert blocked_publish.status_code == 409

    decision = client.post(
        f"/api/v1/spec/{project_id}/decisions",
        json={"decision_type": "RESEARCH_GAP", "value": "Focus on sparse-sensor urban flood prediction."},
    )
    assert decision.status_code == 200

    interpretation = client.post(
        f"/api/v1/spec/{project_id}/decisions",
        json={
            "decision_type": "IDEA_INTERPRETATION",
            "value": "A flood early-warning study with measurable prediction accuracy under sparse sensor coverage.",
        },
    )
    assert interpretation.status_code == 200

    related_work = client.post(
        f"/api/v1/spec/{project_id}/related-work",
        json={
            "title": "Sparse sensing for urban flood prediction",
            "url": "https://doi.org/10.1000/example",
            "year": 2024,
            "approach": "Uses rainfall and river sensor features in a supervised prediction model.",
            "limitation": "Does not report performance when sensor coverage is sparse.",
        },
    )
    assert related_work.status_code == 200
    related_work_list = client.get(f"/api/v1/spec/{project_id}/related-work")
    assert related_work_list.status_code == 200
    assert related_work_list.json()[0]["title"] == "Sparse sensing for urban flood prediction"

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

    publication = client.post(f"/api/v1/spec/{project_id}/publish")
    assert publication.status_code == 200
    assert publication.json()["workflow_status"] == "PUBLISHED"
    assert publication.json()["published_version"] == 1
    assert publication.json()["published_at"]
    assert "## 14. Decision history" in publication.json()["content"]
    repeated_publication = client.post(f"/api/v1/spec/{project_id}/publish")
    assert repeated_publication.status_code == 200
    assert repeated_publication.json()["published_at"] == publication.json()["published_at"]

    evidence_analysis = client.get(f"/api/v1/spec/{project_id}/evidence/analysis")
    assert evidence_analysis.status_code == 200
    assert evidence_analysis.json()["findings"][0]["kind"] == "AMBIGUITY"

    conflicting_evidence = client.post(
        f"/api/v1/spec/{project_id}/evidence",
        json={
            "title": "Replication study",
            "url": "https://example.org/replication",
            "claim": "Sparse-sensor flood prediction remains under-evaluated.",
            "passage": "This replication finds the setting is already broadly evaluated.",
            "verdict": "CONTRADICTED",
        },
    )
    assert conflicting_evidence.status_code == 200
    publication_after_evidence_change = client.get(
        f"/api/v1/spec/{project_id}/publication"
    )
    assert publication_after_evidence_change.status_code == 200
    assert publication_after_evidence_change.json()["workflow_status"] == "ACTIVE"
    conflict_analysis = client.get(f"/api/v1/spec/{project_id}/evidence/analysis")
    assert conflict_analysis.status_code == 200
    assert conflict_analysis.json()["findings"][0]["kind"] == "CONFLICT"

    consensus = client.get(f"/api/v1/spec/{project_id}/consensus")
    assert consensus.status_code == 200
    assert consensus.json()["judge_count"] == 5
    assert consensus.json()["agreement_score"] >= 0
    assert consensus.json()["agreed_findings"]

    compiled = client.get(f"/api/v1/spec/{project_id}/compiled-spec")
    assert compiled.status_code == 200
    assert len(compiled.json()["sections"]) == 14
    assert "## 3. Related-work matrix" in compiled.json()["content"]
    assert "flood early-warning study" in compiled.json()["content"]
    assert any(
        section["key"] == "claim-evidence" and section["status"] == "WARNING"
        for section in compiled.json()["sections"]
    )

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
