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
  estimated_hours: number;
  estimated_llm_calls: number;
  estimated_token_budget: number;
  recommendation: string;
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

export interface JudgeConsensus {
  project_id: string;
  spec_version_used: number;
  judge_count: number;
  major_count: number;
  minor_count: number;
  consensus: string;
  disagreements: string[];
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
