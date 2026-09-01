export type CardStatus =
  | "CONFIRMED"
  | "PROPOSED"
  | "MISSING"
  | "AMBIGUOUS"
  | "UNSUPPORTED"
  | "CONFLICT";

export interface SpecCard {
  type: string;
  content: string;
  status: CardStatus;
}

export interface JudgeFeedback {
  judge: string;
  severity: "MINOR" | "MAJOR";
  issue: string;
  rationale: string;
  recommendation: string;
}

export interface AgentRuntime {
  provider: string;
  model: string;
  mode: "mock" | "live";
  roles: string[];
}

export interface JudgeRun {
  judge: string;
  spec_version_used: number;
  status: "COMPLETED" | "STALE";
  severity: "MINOR" | "MAJOR";
}

export interface JudgeExecutionResponse {
  project_id: string;
  spec_version_used: number;
  judges: JudgeFeedback[];
  judge_runs: JudgeRun[];
  readiness_score: number;
  agent_runtime: AgentRuntime;
}

export interface RelatedWorkItem {
  title: string;
  year: number;
  url: string;
  approach: string;
  limitation: string;
}

export interface ClaimEvidenceItem {
  claim: string;
  baseline: string;
  metric: string;
  evidence_needed: string;
  falsification: string;
  verification: "SUPPORTED" | "CONTRADICTED" | "INSUFFICIENT";
  verification_rationale: string;
}

export interface ExperimentPlan {
  experiment: string;
  purpose: string;
  setup: string[];
}

export interface ComputeBudget {
  target_resource: string;
  model: string;
  estimated_vram_gb: number;
  seed_prompts: number;
  candidates_per_round: number;
  optimization_rounds: number;
  development_samples: number;
  validation_samples: number;
  top_candidates: number;
  estimated_hours: number;
  estimated_llm_calls: number;
  estimated_token_budget: number;
  recommendation: string;
  reduction_suggestion: string;
}

export interface SpecSectionStatus {
  key: string;
  title: string;
  status: "READY" | "NEEDS_INPUT" | "WARNING";
  detail: string;
}

export interface CompiledSpecResponse {
  project_id: string;
  version: number;
  content: string;
  sections: SpecSectionStatus[];
  blockers: string[];
}

export interface PublicationStatus {
  project_id: string;
  workflow_status: "ACTIVE" | "PUBLISHED";
  current_version: number;
  published_version: number | null;
  published_at: string | null;
  content: string | null;
}

export interface AnalyzeResponse {
  project_id: string;
  created_at: string;
  input_idea: string;
  interpreted_idea: string;
  cards: SpecCard[];
  related_work: RelatedWorkItem[];
  claim_evidence: ClaimEvidenceItem[];
  experiment_plan: ExperimentPlan[];
  compute_budget: ComputeBudget;
  draft_spec: string;
  judges: JudgeFeedback[];
  readiness_score: number;
  version: number;
  agent_runtime: AgentRuntime;
  judge_runs: JudgeRun[];
}

export interface ReviseResponse {
  project_id: string;
  revised_spec: string;
  change_log: string[];
  diff_summary: string[];
  judges: JudgeFeedback[];
  readiness_score: number;
  version: number;
  agent_runtime: AgentRuntime;
  judge_runs: JudgeRun[];
}

export interface VersionHistoryItem {
  version: number;
  change_log: string[];
  readiness_score: number;
  created_at: string;
}

export interface DecisionRecord {
  decision_type: string;
  value: string;
  spec_version: number;
  created_at: string;
}

export interface EvidenceRecord {
  id: string;
  title: string;
  url: string;
  claim: string;
  passage: string;
  verdict: "SUPPORTED" | "CONTRADICTED" | "INSUFFICIENT";
  spec_version: number;
  created_at: string;
}

export interface SourceSearchItem {
  title: string;
  year: number | null;
  url: string;
  authors: string;
  venue: string | null;
  source_provider: string;
  cited_by_count: number;
  is_open_access: boolean;
}

export interface RelatedWorkRecord {
  id: string;
  title: string;
  url: string;
  year: number | null;
  approach: string;
  limitation: string;
  spec_version: number;
  created_at: string;
}

export interface EvidenceFinding {
  kind: "AMBIGUITY" | "CONFLICT";
  claim: string;
  detail: string;
  evidence_ids: string[];
}

export interface JudgeConsensus {
  project_id: string;
  spec_version_used: number;
  judge_count: number;
  major_count: number;
  minor_count: number;
  agreement_score: number;
  consensus: string;
  agreed_findings: string[];
  disagreements: string[];
  role_findings: string[];
}

export interface VersionDiff {
  project_id: string;
  from_version: number;
  to_version: number;
  diff_lines: string[];
}

let activeWorkspace: AnalyzeResponse | null = null;

export function getActiveWorkspace(): AnalyzeResponse | null {
  return activeWorkspace;
}

export function setActiveWorkspace(workspace: AnalyzeResponse): void {
  activeWorkspace = workspace;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function analyzeIdea(
  idea: string,
  targetResource: string,
): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/api/v1/spec/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, target_resource: targetResource }),
  });

  if (!response.ok) {
    throw new Error(`Analyze failed with status ${response.status}`);
  }

  return (await response.json()) as AnalyzeResponse;
}

export async function reviseSpec(
  projectId: string,
  draftSpec: string,
  strategy:
    | "NARROW_CLAIM"
    | "EXPAND_EXPERIMENT"
    | "TURN_INTO_QUESTION"
    | "CUSTOM",
  customNote?: string,
): Promise<ReviseResponse> {
  const response = await fetch(`${API_BASE}/api/v1/spec/revise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      draft_spec: draftSpec,
      strategy,
      custom_note: customNote || null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Revise failed with status ${response.status}`);
  }

  return (await response.json()) as ReviseResponse;
}

export async function runLatestSpecJudges(
  projectId: string,
): Promise<JudgeExecutionResponse> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/judges/run`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(`Judge run failed with status ${response.status}`);
  }

  return (await response.json()) as JudgeExecutionResponse;
}

export async function getProjectHistory(
  projectId: string,
): Promise<VersionHistoryItem[]> {
  const response = await fetch(`${API_BASE}/api/v1/spec/${projectId}/history`);

  if (!response.ok) {
    throw new Error(`History failed with status ${response.status}`);
  }

  return (await response.json()) as VersionHistoryItem[];
}

export async function getCompiledSpec(
  projectId: string,
): Promise<CompiledSpecResponse> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/compiled-spec`,
  );
  if (!response.ok)
    throw new Error(`Compiled spec failed with status ${response.status}`);
  return (await response.json()) as CompiledSpecResponse;
}

export async function getPublication(
  projectId: string,
): Promise<PublicationStatus> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/publication`,
  );
  if (!response.ok)
    throw new Error(`Publication status failed with status ${response.status}`);
  return (await response.json()) as PublicationStatus;
}

export async function publishSpec(
  projectId: string,
): Promise<PublicationStatus> {
  const response = await fetch(`${API_BASE}/api/v1/spec/${projectId}/publish`, {
    method: "POST",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: { message?: string } | string;
    } | null;
    const detail =
      typeof body?.detail === "string" ? body.detail : body?.detail?.message;
    throw new Error(detail ?? `Publish failed with status ${response.status}`);
  }
  return (await response.json()) as PublicationStatus;
}

export async function saveDecision(
  projectId: string,
  decisionType: string,
  value: string,
): Promise<DecisionRecord> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/decisions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision_type: decisionType, value }),
    },
  );
  if (!response.ok)
    throw new Error(`Decision failed with status ${response.status}`);
  return (await response.json()) as DecisionRecord;
}

export async function getDecisions(
  projectId: string,
): Promise<DecisionRecord[]> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/decisions`,
  );
  if (!response.ok)
    throw new Error(`Decisions failed with status ${response.status}`);
  return (await response.json()) as DecisionRecord[];
}

export async function saveEvidence(
  projectId: string,
  evidence: Omit<EvidenceRecord, "id" | "spec_version" | "created_at">,
): Promise<EvidenceRecord> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/evidence`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evidence),
    },
  );
  if (!response.ok)
    throw new Error(`Evidence failed with status ${response.status}`);
  return (await response.json()) as EvidenceRecord;
}

export async function getEvidence(
  projectId: string,
): Promise<EvidenceRecord[]> {
  const response = await fetch(`${API_BASE}/api/v1/spec/${projectId}/evidence`);
  if (!response.ok)
    throw new Error(`Evidence failed with status ${response.status}`);
  return (await response.json()) as EvidenceRecord[];
}

export async function searchSources(
  projectId: string,
  query: string,
): Promise<SourceSearchItem[]> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/sources/search?query=${encodeURIComponent(query)}`,
  );
  if (!response.ok)
    throw new Error(`Source search failed with status ${response.status}`);
  return ((await response.json()) as { sources: SourceSearchItem[] }).sources;
}

export async function getEvidenceAnalysis(
  projectId: string,
): Promise<EvidenceFinding[]> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/evidence/analysis`,
  );
  if (!response.ok)
    throw new Error(`Evidence analysis failed with status ${response.status}`);
  return ((await response.json()) as { findings: EvidenceFinding[] }).findings;
}

export async function saveRelatedWork(
  projectId: string,
  item: Omit<RelatedWorkRecord, "id" | "spec_version" | "created_at">,
): Promise<RelatedWorkRecord> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/related-work`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    },
  );
  if (!response.ok)
    throw new Error(`Related work save failed with status ${response.status}`);
  return (await response.json()) as RelatedWorkRecord;
}

export async function getRelatedWork(
  projectId: string,
): Promise<RelatedWorkRecord[]> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/related-work`,
  );
  if (!response.ok)
    throw new Error(`Related work failed with status ${response.status}`);
  return (await response.json()) as RelatedWorkRecord[];
}

export async function getJudgeConsensus(
  projectId: string,
): Promise<JudgeConsensus> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/consensus`,
  );
  if (!response.ok)
    throw new Error(`Consensus failed with status ${response.status}`);
  return (await response.json()) as JudgeConsensus;
}

export async function getVersionDiff(
  projectId: string,
  fromVersion: number,
  toVersion: number,
): Promise<VersionDiff> {
  const response = await fetch(
    `${API_BASE}/api/v1/spec/${projectId}/diff?from_version=${fromVersion}&to_version=${toVersion}`,
  );
  if (!response.ok)
    throw new Error(`Diff failed with status ${response.status}`);
  return (await response.json()) as VersionDiff;
}
