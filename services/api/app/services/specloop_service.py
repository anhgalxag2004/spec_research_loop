import json
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.schemas import (
    ClaimEvidenceItem,
    ComputeBudget,
    ExperimentPlan,
    JudgeFeedback,
    RelatedWorkItem,
    ReviseRequest,
    EvidenceFinding,
    SpecCard,
    SpecSectionStatus,
    SourceSearchItem,
)


SEARCH_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "based",
    "be",
    "build",
    "by",
    "can",
    "compare",
    "create",
    "data",
    "dataset",
    "datasets",
    "design",
    "develop",
    "do",
    "does",
    "evaluate",
    "for",
    "from",
    "in",
    "implement",
    "is",
    "method",
    "model",
    "models",
    "of",
    "on",
    "or",
    "research",
    "study",
    "system",
    "that",
    "the",
    "this",
    "to",
    "use",
    "using",
    "with",
}

ACTION_NORMALIZATION = {
    "classifies": "classification",
    "classify": "classification",
    "classifying": "classification",
    "detect": "detection",
    "detected": "detection",
    "detecting": "detection",
    "detects": "detection",
    "forecasts": "forecast",
    "forecasting": "forecast",
    "optimizes": "optimization",
    "optimize": "optimization",
    "optimizing": "optimization",
    "predict": "prediction",
    "predicted": "prediction",
    "predicting": "prediction",
    "predicts": "prediction",
    "predictions": "prediction",
    "verifies": "verification",
    "verify": "verification",
    "verifying": "verification",
}

TOPIC_AFTER_ACTIONS = {
    "classification",
    "detection",
    "forecast",
    "prediction",
    "segmentation",
}


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
            type="Claim",
            content="The proposed approach should improve a pre-defined outcome against a matched baseline under the stated resource constraints.",
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
        SpecCard(
            type="Open question",
            content="Which population, data source, and primary metric should be fixed before evaluating the proposed claim?",
            status="AMBIGUOUS",
        ),
    ]


def build_draft_spec(idea: str, cards: list[SpecCard]) -> str:
    card_by_type = {card.type: card.content for card in cards}
    return (
        "# Research Specification Draft\n\n"
        f"## 1. Problem statement\n{card_by_type.get('Problem', idea)}\n\n"
        f"## 2. Research questions\n{card_by_type.get('Research question', 'Define a testable research question.')}\n\n"
        "## 3. Related-work matrix\nNo related-work source has been reviewed yet.\n\n"
        f"## 4. Research gap\n{card_by_type.get('Gap candidate', 'Requires evidence from related work.')}\n\n"
        f"## 5. Proposed approach\n{card_by_type.get('Contribution', 'Define the proposed approach.')}\n\n"
        f"## 6. Expected contributions\n{card_by_type.get('Claim', 'Define a falsifiable contribution claim.')}\n\n"
        f"## 7. Claim-evidence matrix\n{card_by_type.get('Evidence', 'Evidence requirements are not defined yet.')}\n\n"
        "## 8. Experimental protocol\n"
        "1. Define a domain-appropriate baseline and primary outcome metric.\n"
        "2. Compare the proposed approach and baseline under matched resources.\n"
        "3. Run an ablation for each proposed component.\n"
        "4. Report limitations and results on a held-out evaluation split.\n\n"
        "## 9. Baselines and metrics\nSelect a baseline and metric before evaluation.\n\n"
        "## 10. Ablation plan\nRemove one proposed component at a time while holding other conditions fixed.\n\n"
        "## 11. Compute budget\nEstimate resource use before running experiments.\n\n"
        "## 12. Risks and limitations\nAvoid claims that are not supported by recorded evidence.\n\n"
        f"## 13. Open issues\n{card_by_type.get('Open question', 'No open issue has been recorded.')}\n\n"
        "## 14. Decision history\nNo user decision has been recorded yet.\n"
    )


def build_related_work() -> list[RelatedWorkItem]:
    return []


def derive_scholarly_query(query: str) -> str:
    raw_tokens = re.findall(r"[\w-]+", query.casefold(), flags=re.UNICODE)
    terms = [
        ACTION_NORMALIZATION.get(token, token)
        for token in raw_tokens
        if len(token) > 2 and token not in SEARCH_STOP_WORDS
    ]
    if not terms:
        return " ".join(query.split())[:180]

    for index, action in enumerate(terms):
        if action not in TOPIC_AFTER_ACTIONS:
            continue
        following_terms = [term for term in terms[index + 1 :] if term != action]
        preceding_terms = [term for term in terms[:index] if term != action]
        if len(following_terms) >= 2:
            return " ".join([*following_terms[:2], action])
        if len(preceding_terms) >= 2:
            return " ".join([*preceding_terms[-2:], action])

    unique_terms: list[str] = []
    for term in terms:
        if term not in unique_terms:
            unique_terms.append(term)
    return " ".join(unique_terms[:4])


def _search_openalex_sources(query: str) -> list[SourceSearchItem]:
    title_query = derive_scholarly_query(query)
    parameters = urlencode(
        {
            "filter": f"title.search:{title_query}",
            "per-page": 8,
            "select": "id,display_name,publication_year,doi,authorships,primary_location,cited_by_count,open_access",
        }
    )
    request = Request(
        f"https://api.openalex.org/works?{parameters}",
        headers={"User-Agent": "SpecResearchLoop/1.0 (research-specification tool)"},
    )
    try:
        with urlopen(request, timeout=8) as response:
            items = json.load(response)["results"]
    except (OSError, ValueError, KeyError):
        return []

    sources: list[SourceSearchItem] = []
    for item in items:
        title = str(item.get("display_name") or "").strip()
        primary_location = item.get("primary_location") or {}
        primary_source = primary_location.get("source") or {}
        url = str(
            item.get("doi")
            or primary_location.get("landing_page_url")
            or item.get("id")
            or ""
        ).strip()
        if not title or not url.startswith(("https://", "http://")):
            continue
        authors = item.get("authorships", [])
        author_names = [
            str(authorship.get("author", {}).get("display_name") or "").strip()
            for authorship in authors[:3]
        ]
        author_text = ", ".join(name for name in author_names if name) or "Unknown author"
        if len(authors) > 3:
            author_text += " et al."
        year = item.get("publication_year")
        sources.append(
            SourceSearchItem(
                title=title,
                year=year if isinstance(year, int) else None,
                url=url,
                authors=author_text,
                venue=str(primary_source.get("display_name") or "").strip() or None,
                source_provider="OpenAlex",
                cited_by_count=int(item.get("cited_by_count") or 0),
                is_open_access=bool((item.get("open_access") or {}).get("is_oa")),
            )
        )
    return sources


def _search_crossref_sources(query: str) -> list[SourceSearchItem]:
    parameters = urlencode(
        {
            "query.bibliographic": query,
            "rows": 8,
            "select": "title,author,published,URL,container-title,DOI,is-referenced-by-count",
        }
    )
    request = Request(
        f"https://api.crossref.org/works?{parameters}",
        headers={"User-Agent": "SpecResearchLoop/1.0 (research-specification tool)"},
    )
    try:
        with urlopen(request, timeout=8) as response:
            items = json.load(response)["message"]["items"]
    except (OSError, ValueError, KeyError):
        return []

    sources: list[SourceSearchItem] = []
    for item in items:
        title = " ".join(item.get("title", [])).strip()
        doi = str(item.get("DOI") or "").strip()
        url = str(item.get("URL") or (f"https://doi.org/{doi}" if doi else "")).strip()
        if not title or not url.startswith(("https://", "http://")):
            continue
        authors = item.get("author", [])
        author_text = ", ".join(
            " ".join(
                part
                for part in [author.get("given"), author.get("family")]
                if part
            )
            for author in authors[:3]
        ) or "Unknown author"
        if len(authors) > 3:
            author_text += " et al."
        date_parts = item.get("published", {}).get("date-parts", [[]])
        year = date_parts[0][0] if date_parts and date_parts[0] else None
        sources.append(
            SourceSearchItem(
                title=title,
                year=year if isinstance(year, int) else None,
                url=url,
                authors=author_text,
                venue=" ".join(item.get("container-title", [])).strip() or None,
                source_provider="Crossref",
                cited_by_count=int(item.get("is-referenced-by-count") or 0),
            )
        )
    return sources


def search_scholarly_sources(query: str) -> list[SourceSearchItem]:
    """Retrieve real bibliographic metadata; evidence still requires user review."""
    cleaned_query = " ".join(query.split())[:500]
    if not cleaned_query:
        return []
    return _search_openalex_sources(cleaned_query) or _search_crossref_sources(
        cleaned_query
    )


def analyze_evidence_records(records: list[dict[str, object]]) -> list[EvidenceFinding]:
    grouped: dict[str, list[dict[str, object]]] = {}
    for record in records:
        claim = str(record["claim"]).strip()
        grouped.setdefault(claim.casefold(), []).append(record)

    findings: list[EvidenceFinding] = []
    for claim_records in grouped.values():
        verdicts = {str(record["verdict"]) for record in claim_records}
        evidence_ids = [str(record["id"]) for record in claim_records]
        claim = str(claim_records[0]["claim"])
        if "SUPPORTED" in verdicts and "CONTRADICTED" in verdicts:
            findings.append(EvidenceFinding(kind="CONFLICT", claim=claim, detail="Các nguồn lưu cho cùng claim đưa ra verdict trái ngược. Hãy đọc lại passage và thu hẹp claim trước khi đưa vào spec.", evidence_ids=evidence_ids))
        elif "INSUFFICIENT" in verdicts or len(claim_records) == 1:
            findings.append(EvidenceFinding(kind="AMBIGUITY", claim=claim, detail="Claim chưa có đủ evidence độc lập để kết luận. Cần thêm nguồn, passage hoặc verdict.", evidence_ids=evidence_ids))
    return findings


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
    resource = target_resource.casefold()
    high_memory = any(token in resource for token in ("3090", "4090", "a10", "a100", "l40"))
    estimated_vram_gb = 24.0 if high_memory else 16.0
    candidates_per_round = 10 if high_memory else 6
    optimization_rounds = 10 if high_memory else 6
    validation_samples = 300 if high_memory else 150
    top_candidates = 5 if high_memory else 3
    estimated_llm_calls = candidates_per_round * optimization_rounds * 30
    estimated_token_budget = estimated_llm_calls * 400
    return ComputeBudget(
        target_resource=target_resource,
        model="7B-8B model, 4-bit quantized" if high_memory else "3B-4B model, 4-bit quantized",
        estimated_vram_gb=estimated_vram_gb,
        seed_prompts=5,
        candidates_per_round=candidates_per_round,
        optimization_rounds=optimization_rounds,
        development_samples=50,
        validation_samples=validation_samples,
        top_candidates=top_candidates,
        estimated_hours=7.5 if high_memory else 4.5,
        estimated_llm_calls=estimated_llm_calls,
        estimated_token_budget=estimated_token_budget,
        recommendation="Use matched resource limits for every baseline and reserve the held-out split for the top candidates only.",
        reduction_suggestion=(
            "If cost exceeds the available budget, reduce candidates per round before reducing the held-out validation split."
            if high_memory
            else "This resource profile is conservative. Reduce rounds to 4 and candidates per round to 4 if memory or time is constrained."
        ),
    )


def _markdown_cell(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ").strip()


def compile_research_spec(
    latest_spec: dict[str, object],
    related_work: list[dict[str, object]],
    evidence: list[dict[str, object]],
    decisions: list[dict[str, object]],
    budget: ComputeBudget,
) -> tuple[str, list[SpecSectionStatus], list[str]]:
    idea = str(latest_spec["idea"])
    version = int(latest_spec["version"])
    interpretation = next(
        (
            str(item["value"])
            for item in decisions
            if item["decision_type"] == "IDEA_INTERPRETATION"
        ),
        idea,
    )
    gap_decision = next(
        (str(item["value"]) for item in decisions if item["decision_type"] == "RESEARCH_GAP"),
        None,
    )
    evidence_findings = analyze_evidence_records(evidence)
    supported_evidence = [item for item in evidence if item["verdict"] == "SUPPORTED"]
    blockers: list[str] = []
    sections: list[SpecSectionStatus] = []

    def add_section(key: str, title: str, status: str, detail: str) -> None:
        sections.append(SpecSectionStatus(key=key, title=title, status=status, detail=detail))

    add_section(
        "problem",
        "Problem statement",
        "READY",
        "A user-confirmed interpretation is recorded."
        if interpretation != idea
        else "Input idea and research scope are recorded.",
    )
    add_section("question", "Research questions", "READY", "A testable question is included in the generated draft.")
    if related_work:
        add_section("related-work", "Related-work matrix", "READY", f"{len(related_work)} source(s) have been annotated.")
    else:
        blockers.append("Add at least one related-work source with an approach and limitation.")
        add_section("related-work", "Related-work matrix", "NEEDS_INPUT", "No annotated related-work source is recorded.")
    if gap_decision:
        add_section("gap", "Research gap", "READY", "A user-selected research-gap direction is recorded.")
    else:
        blockers.append("Select and save a research-gap direction before final publication.")
        add_section("gap", "Research gap", "NEEDS_INPUT", "No research-gap decision is recorded.")
    add_section("approach", "Proposed approach", "READY", "The generated draft defines an initial approach.")
    add_section("contributions", "Expected contributions", "READY", "The initial contribution and falsifiable claim are included.")
    if any(item.kind == "CONFLICT" for item in evidence_findings):
        blockers.append("Resolve conflicting evidence verdicts before making the affected claim.")
        add_section("claim-evidence", "Claim-evidence matrix", "WARNING", "At least one claim has conflicting evidence verdicts.")
    elif supported_evidence:
        add_section("claim-evidence", "Claim-evidence matrix", "READY", f"{len(supported_evidence)} supported evidence record(s) are linked.")
    else:
        blockers.append("Record at least one supported evidence passage for a claim.")
        add_section("claim-evidence", "Claim-evidence matrix", "NEEDS_INPUT", "No supported evidence record is linked yet.")
    add_section("experiments", "Experimental protocol", "READY", "The draft includes matched baseline, ablation, and held-out evaluation steps.")
    add_section("metrics", "Baselines and metrics", "READY", "The current plan requires a pre-defined baseline and primary outcome metric.")
    add_section("ablation", "Ablation plan", "READY", "The current plan removes one proposed component at a time.")
    add_section("budget", "Compute budget", "READY", f"Estimated for {budget.target_resource}.")
    risk_status = "WARNING" if evidence_findings else "READY"
    add_section("risks", "Risks and limitations", risk_status, "Evidence findings are reflected as risks and limitations.")
    add_section("open-issues", "Open issues", "READY", "Open evidence and decision gaps are listed explicitly.")
    if decisions:
        add_section("decisions", "Decision history", "READY", f"{len(decisions)} user decision(s) are recorded.")
    else:
        add_section("decisions", "Decision history", "NEEDS_INPUT", "No user decision is recorded yet.")

    related_rows = "\n".join(
        f"| {_markdown_cell(item['title'])} | {_markdown_cell(item.get('approach', ''))} | {_markdown_cell(item.get('limitation', ''))} | {_markdown_cell(item['url'])} |"
        for item in related_work
    ) or "| No source recorded | - | - | - |"
    evidence_rows = "\n".join(
        f"| {_markdown_cell(item['claim'])} | {_markdown_cell(item['verdict'])} | {_markdown_cell(item['title'])} | {_markdown_cell(item['url'])} |"
        for item in evidence
    ) or "| No evidence record | INSUFFICIENT | - | - |"
    decision_rows = "\n".join(
        f"- v{item['spec_version']} · {_markdown_cell(item['decision_type'])}: {_markdown_cell(item['value'])}"
        for item in decisions
    ) or "- No user decision has been recorded yet."
    open_issues = "\n".join(f"- {item.detail}" for item in evidence_findings)
    if not open_issues:
        open_issues = "- Confirm the population, data source, baseline, and primary metric before evaluation."

    content = f"""# Research Specification v{version}

## 1. Problem statement
{interpretation}

## 2. Research questions
Does a clearly defined approach for this idea improve a pre-registered primary outcome against a matched baseline under the same resource constraints?

## 3. Related-work matrix
| Source | Approach | Limitation | URL |
| --- | --- | --- | --- |
{related_rows}

## 4. Research gap
{gap_decision or 'Not confirmed yet. The gap must be selected after reviewing related-work limitations.'}

## 5. Proposed approach
Develop a testable approach for the stated problem, with the generated planning draft and subsequent user decisions retained as versioned provenance.

## 6. Expected contributions
- A falsifiable method or research insight addressing the selected gap.
- A transparent evaluation protocol that reports both outcome quality and resource cost.

## 7. Claim-evidence matrix
| Claim | Verdict | Source | URL |
| --- | --- | --- | --- |
{evidence_rows}

## 8. Experimental protocol
1. Compare the proposed approach with a domain-appropriate baseline using the same data split, model budget, and evaluation conditions.
2. Measure the pre-registered primary outcome together with resource cost.
3. Remove one proposed component at a time for ablation.
4. Evaluate top candidates on a held-out split.

## 9. Baselines and metrics
- Baseline: a current standard, no-intervention, or researcher-selected baseline appropriate to the task.
- Primary metric: defined before evaluation and reported with the matched resource cost.

## 10. Ablation plan
Remove each proposed component independently while keeping the dataset, model, token/API budget, and evaluation protocol fixed.

## 11. Compute budget
- Target resource: {budget.target_resource}
- Model profile: {budget.model}
- Estimated VRAM: {budget.estimated_vram_gb:g} GB
- Seed prompts: {budget.seed_prompts}; candidates per round: {budget.candidates_per_round}; rounds: {budget.optimization_rounds}
- Development samples: {budget.development_samples}; validation samples: {budget.validation_samples}; top candidates: {budget.top_candidates}
- Estimated time: {budget.estimated_hours:g} hours; estimated calls: {budget.estimated_llm_calls:,}; token/API budget: {budget.estimated_token_budget:,}
- Budget guidance: {budget.reduction_suggestion}

## 12. Risks and limitations
- Metadata search is not evidence verification; each source requires a reviewed passage and verdict.
- Do not claim novelty or generalization beyond the linked evidence and evaluation scope.

## 13. Open issues
{open_issues}

## 14. Decision history
{decision_rows}
"""
    return content, sections, blockers


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
            issue="The proposed contribution needs a clearer distinction from the current baseline or standard practice.",
            rationale="A contribution is not yet defensible until its difference and expected effect are stated precisely.",
            recommendation="State the primary contribution, matched baseline, metric, and falsification condition together.",
        ),
        JudgeFeedback(
            judge="Experiment Judge",
            severity="MAJOR",
            issue="Current draft lacks full ablation dimensions.",
            rationale="Cannot isolate which component drives improvement.",
            recommendation="Include component ablations, matched controls, and a held-out evaluation split.",
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
        revised += "\n\n## Revision\nScope is limited to the population, outcome, and evidence currently recorded in this specification."
        changes.append("Limited the claim to the validated population, outcome, and available evidence.")
    elif payload.strategy == "EXPAND_EXPERIMENT":
        revised += "\n\n## Revision\nAdded matched baseline comparisons, component ablations, and a held-out evaluation split."
        changes.append("Expanded the experiment plan with fair comparison, ablation, and held-out evaluation.")
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
