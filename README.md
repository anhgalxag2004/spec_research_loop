# SpecResearch Loop - Full Version (2-Day Build)

Monorepo template for a complete MVP:

- Frontend: Next.js 15 + TypeScript
- Backend: FastAPI + uv
- Runtime: Docker Desktop with Docker Compose

## 1) What this build includes

- Idea input and reinterpretation.
- Problem decomposition into cards (problem, gap, claim, evidence, constraints).
- Draft research spec generator.
- Five independent Judge roles with `spec_version_used` provenance.
- Persisted user decisions, source/evidence records, consensus, version history, and server-side diffs.
- Final Markdown export and persisted publication confirmation.
- OpenAI-compatible runtime configuration, including local Ollama.

## 2) Project structure

- `apps/web`: Next.js frontend.
- `services/api`: FastAPI backend managed by uv.
- `docker-compose.yml`: Run all services in Docker Desktop.

## 3) Quick start

1. Copy env file.
   - `copy .env.example .env`
2. Start Docker Desktop.
3. Run stack:
   - `docker compose up --build`
4. Open:
   - Web: http://localhost:3000
   - API docs: http://localhost:8000/docs

## 4) Day-by-day delivery plan

### Day 1

- Scaffold backend and frontend.
- Implement core flow: idea -> decomposition -> draft spec.
- Build API contracts and wire frontend forms.
- Add basic UI for cards, judge feedback, and revision decisions.

### Day 2

- Complete judge loop and decision history UI.
- Improve validation, error states, loading UX.
- Add tests for core API services.
- Finalize README, architecture notes, demo script.

## 5) Submission artifacts

- [Architecture](ARCHITECTURE.md)
- [LLM prompts](docs/prompts.md)
- [Use-case dataset](dataset/use-cases.json)
- [Evaluation protocol and two baselines](docs/evaluation-protocol.md)

## 6) Evidence workflow

Step 3 lets a researcher save a source URL, target claim, quoted passage, and
evidence verdict (`SUPPORTED`, `CONTRADICTED`, or `INSUFFICIENT`). The system
does not claim a source is verified unless that evidence record exists.

## 7) Local development without Docker (optional)

### Backend

- `cd services/api`
- `uv sync`
- `uv run uvicorn app.main:app --reload --port 8000`

### Frontend

- `cd apps/web`
- `npm install`
- `npm run dev`

## 8) Suggested next upgrades

- Add an external scholarly search/retrieval connector for automatic evidence collection.
- Add multi-provider Judge assignment to compare model bias.
- Add a full evaluation report generated from repeated use-case runs.
