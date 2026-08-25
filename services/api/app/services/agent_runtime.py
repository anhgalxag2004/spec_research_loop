import json
from http.client import RemoteDisconnected
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings
from app.schemas import AgentRuntime, JudgeFeedback, ResearchPlan


AGENT_ROLES = [
    "Research Planner",
    "Evidence Verifier",
    "Research Gap Judge",
    "Contribution Judge",
    "Experiment Judge",
    "Evidence Judge",
    "Conference Readiness Judge",
]


def runtime_metadata() -> AgentRuntime:
    live = settings.llm_provider != "mock" and bool(settings.llm_base_url and settings.llm_model)
    return AgentRuntime(
        provider=settings.llm_provider if live else "mock",
        model=settings.llm_model if live else "Deterministic demo agents",
        mode="live" if live else "mock",
        roles=AGENT_ROLES,
    )


def _chat_json(system_prompt: str, user_prompt: str, max_tokens: int = 1200) -> object | None:
    """Call a compatible chat endpoint and only return valid JSON content."""
    if runtime_metadata().mode != "live":
        return None

    endpoint = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": settings.llm_model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": max_tokens,
    }
    if settings.llm_provider == "ollama":
        payload["think"] = False
    request = Request(
        endpoint,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.llm_api_key}",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.llm_timeout_seconds) as response:
            data = json.loads(response.read().decode())
        message = data["choices"][0]["message"]
        content = (
            message.get("content")
            or message.get("reasoning")
            or message.get("reasoning_content")
        )
        return json.loads(content)
    except (
        HTTPError,
        URLError,
        TimeoutError,
        RemoteDisconnected,
        OSError,
        KeyError,
        IndexError,
        TypeError,
        json.JSONDecodeError,
    ):
        return None


def generate_research_plan(idea: str, target_resource: str) -> ResearchPlan | None:
    response = _chat_json(
        """You are the Research Planner and Evidence Verifier in an Agentic SDLC system.
Return one JSON object only, with keys interpreted_idea, cards, related_work, claim_evidence, experiment_plan, draft_spec.
Do not invent publication URLs or claim that a source proves something you did not retrieve. For each claim_evidence item, set verification to INSUFFICIENT unless the user supplied verifiable evidence. Write a testable, falsifiable research plan in English. Cards need type, content, status. Related work needs title, year, url, approach, limitation. Claim evidence needs claim, baseline, metric, evidence_needed, falsification, verification, verification_rationale. Experiment items need experiment, purpose, setup.""",
        f"Research idea: {idea}\nAvailable resource: {target_resource}",
        max_tokens=2400,
    )
    try:
        if not isinstance(response, dict):
            return None
        status_map = {
            "pending": "PROPOSED",
            "draft": "PROPOSED",
            "complete": "CONFIRMED",
            "completed": "CONFIRMED",
            "unknown": "AMBIGUOUS",
        }
        for card in response.get("cards", []):
            if isinstance(card, dict):
                status = str(card.get("status", "PROPOSED")).lower()
                card["status"] = status_map.get(status, status.upper())
        for experiment in response.get("experiment_plan", []):
            if isinstance(experiment, dict) and isinstance(experiment.get("setup"), str):
                experiment["setup"] = [experiment["setup"]]
        return ResearchPlan.model_validate(response)
    except (TypeError, ValueError):
        return None


def generate_judges(draft_spec: str) -> list[JudgeFeedback] | None:
    response = _chat_json(
        """You are five independent research-spec judges. Return JSON {\"judges\": [...]}, with exactly five items for Research Gap Judge, Contribution Judge, Experiment Judge, Evidence Judge, and Conference Readiness Judge. Each item needs judge, severity (MINOR or MAJOR), issue, rationale, recommendation. Judge only the supplied spec; do not claim external verification.""",
        draft_spec,
        max_tokens=1200,
    )
    try:
        judges = [JudgeFeedback.model_validate(item) for item in response["judges"]]
        return judges if len(judges) == 5 else None
    except (KeyError, TypeError, ValueError):
        return None


def generate_revision(draft_spec: str, strategy: str, custom_note: str | None) -> tuple[str, list[str]] | None:
    response = _chat_json(
        """You are the Revision Agent. Return JSON with revised_spec and change_log. Apply the requested strategy to the supplied research specification. Preserve useful details, make only defensible changes, and do not invent results or citations. change_log must be a non-empty list of concise strings.""",
        f"Strategy: {strategy}\nUser note: {custom_note or 'None'}\n\nSpecification:\n{draft_spec}",
        max_tokens=1600,
    )
    try:
        revised_spec = str(response["revised_spec"]).strip()
        change_log = [str(item) for item in response["change_log"] if str(item).strip()]
        return (
            (revised_spec, change_log)
            if len(revised_spec) >= 20 and revised_spec != draft_spec and change_log
            else None
        )
    except (KeyError, TypeError):
        return None