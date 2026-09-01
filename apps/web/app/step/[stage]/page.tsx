"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { RouteHeader } from "@/components/RouteHeader";
import {
  getActiveWorkspace,
  getCompiledSpec,
  getDecisions,
  getEvidenceAnalysis,
  getEvidence,
  getJudgeConsensus,
  getRelatedWork,
  getVersionDiff,
  reviseSpec,
  runLatestSpecJudges,
  saveDecision,
  saveEvidence,
  saveRelatedWork,
  searchSources,
  setActiveWorkspace,
  type AnalyzeResponse,
  type CompiledSpecResponse,
  type DecisionRecord,
  type EvidenceFinding,
  type EvidenceRecord,
  type JudgeConsensus,
  type RelatedWorkRecord,
  type SourceSearchItem,
  type VersionDiff,
} from "@/lib/api";
import {
  LAST_WORKFLOW_STAGE,
  getHighestAccessibleStage,
  getWorkflowPath,
  stepConfirmationType,
} from "@/lib/workflow";

const STAGES: Record<string, { title: string; subtitle: string }> = {
  "2": {
    title: "2. Phân rã ý tưởng",
    subtitle:
      "Tổ chức problem, gap, contribution, claim và evidence thành các thẻ có trạng thái.",
  },
  "3": {
    title: "3. Nghiên cứu công trình liên quan",
    subtitle:
      "Đối sánh nguồn, phương pháp, feedback và giới hạn của từng công trình.",
  },
  "4": {
    title: "4. Đề xuất Research Gap",
    subtitle:
      "Chỉ chốt gap khi có hạn chế cụ thể từ công trình liên quan và cách kiểm nghiệm.",
  },
  "5": {
    title: "5. Xây dựng Contribution & Claim",
    subtitle:
      "Mỗi đóng góp và claim đều cần baseline, metric và điều kiện bác bỏ.",
  },
  "6": {
    title: "6. Thiết kế thí nghiệm",
    subtitle:
      "Lập kế hoạch so sánh công bằng, đo chất lượng, ablation và generalization.",
  },
  "7": {
    title: "7. Kiểm tra tính khả thi",
    subtitle:
      "Ước lượng GPU, token, thời gian và quy mô evaluation trong ngân sách.",
  },
  "8": {
    title: "8. Research Spec tạm thời",
    subtitle: "Tổng hợp các quyết định thành bản đặc tả có thể review.",
  },
  "9": {
    title: "9. Judge độc lập",
    subtitle:
      "Đánh giá riêng gap, contribution, thí nghiệm, evidence và readiness.",
  },
  "10": {
    title: "10. Người dùng quyết định sửa đổi",
    subtitle:
      "Tạo phiên bản mới từ phản hồi Judge trước khi xác nhận bản cuối.",
  },
};

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Đã xác nhận",
  PROPOSED: "Đề xuất",
  MISSING: "Còn thiếu",
  AMBIGUOUS: "Mơ hồ",
  UNSUPPORTED: "Chưa có bằng chứng",
  CONFLICT: "Mâu thuẫn",
};

const SPEC_STATUS_LABELS: Record<string, string> = {
  READY: "Đủ thông tin",
  NEEDS_INPUT: "Cần bổ sung",
  WARNING: "Cần xem lại",
};

function Wizard({
  current,
  accessibleStage,
}: {
  current: string;
  accessibleStage: number;
}) {
  return (
    <nav className="route-wizard" aria-label="Tiến trình dự án">
      {[
        ["1", "Diễn giải", "/"],
        ["2", "Phân rã", "/step/2"],
        ["3", "Related work", "/step/3"],
        ["4", "Research gap", "/step/4"],
        ["5", "Contribution", "/step/5"],
        ["6", "Thí nghiệm", "/step/6"],
        ["7", "Khả thi", "/step/7"],
        ["8", "Research spec", "/step/8"],
        ["9", "Judge", "/step/9"],
        ["10", "Sửa đổi", "/step/10"],
      ].map(([number, label, href]) => {
        const targetStage = Number(number);
        const isLocked = targetStage > accessibleStage;
        if (isLocked) {
          return (
            <span
              aria-disabled="true"
              className="route-step locked"
              key={number}
              title={`Hoàn thành bước ${accessibleStage} trước để mở bước này.`}
            >
              <b>{number}</b>
              {label}
            </span>
          );
        }
        return (
          <Link
            className={current === number ? "route-step active" : "route-step"}
            href={href}
            key={number}
          >
            <b>{number}</b>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function StageActions({
  stage,
  onAdvance,
  advanceState,
}: {
  stage: number;
  onAdvance: (completedStage: number) => Promise<void>;
  advanceState: "idle" | "saving" | "error";
}) {
  return (
    <div className="route-actions">
      <Link
        className="secondary-route"
        href={stage === 2 ? "/" : `/step/${stage - 1}`}
      >
        ← Quay lại
      </Link>
      {stage < 10 ? (
        <button
          className="next-route"
          disabled={advanceState === "saving"}
          onClick={() => void onAdvance(stage)}
          type="button"
        >
          {advanceState === "saving"
            ? "Đang lưu checkpoint..."
            : "Xác nhận & tiếp tục →"}
        </button>
      ) : null}
      {advanceState === "error" ? (
        <p className="form-error">Không thể lưu checkpoint của bước này.</p>
      ) : null}
    </div>
  );
}

export default function StagePage() {
  const params = useParams<{ stage: string }>();
  const router = useRouter();
  const stage = params.stage;
  const currentStage = Number(stage);
  const config = STAGES[stage] ?? STAGES["2"];
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(
    getActiveWorkspace,
  );
  const [workspaceChecked, setWorkspaceChecked] = useState(false);
  const [workflowDecisions, setWorkflowDecisions] = useState<DecisionRecord[]>(
    [],
  );
  const [workflowState, setWorkflowState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [advanceState, setAdvanceState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [gapChoice, setGapChoice] = useState("focus-gap");
  const [customGap, setCustomGap] = useState("");
  const [revisionStrategy, setRevisionStrategy] = useState<
    "NARROW_CLAIM" | "EXPAND_EXPERIMENT" | "TURN_INTO_QUESTION" | "CUSTOM"
  >("NARROW_CLAIM");
  const [customNote, setCustomNote] = useState("");
  const [revisionState, setRevisionState] = useState<
    "idle" | "saving" | "done" | "error"
  >("idle");
  const [judgeState, setJudgeState] = useState<"idle" | "running" | "error">(
    "idle",
  );
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [evidenceFindings, setEvidenceFindings] = useState<EvidenceFinding[]>(
    [],
  );
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceResults, setSourceResults] = useState<SourceSearchItem[]>([]);
  const [relatedWork, setRelatedWork] = useState<RelatedWorkRecord[]>([]);
  const [relatedWorkState, setRelatedWorkState] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [showRelatedWorkForm, setShowRelatedWorkForm] = useState(false);
  const [relatedWorkForm, setRelatedWorkForm] = useState({
    title: "",
    url: "",
    year: null as number | null,
    approach: "",
    limitation: "",
  });
  const [searchState, setSearchState] = useState<
    "idle" | "searching" | "error"
  >("idle");
  const [consensus, setConsensus] = useState<JudgeConsensus | null>(null);
  const [compiledSpec, setCompiledSpec] = useState<CompiledSpecResponse | null>(
    null,
  );
  const [revisionDiff, setRevisionDiff] = useState<VersionDiff | null>(null);
  const [cardConfirmationState, setCardConfirmationState] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [gapDecisionState, setGapDecisionState] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [sourceState, setSourceState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [sourceForm, setSourceForm] = useState({
    title: "",
    url: "",
    claim: "",
    passage: "",
    verdict: "INSUFFICIENT" as EvidenceRecord["verdict"],
  });
  const gapCard = analysis?.cards.find((card) => card.type === "Gap candidate");
  const contributionCards = analysis?.cards.filter(
    (card) => card.type === "Contribution" || card.type === "Research question",
  );
  const accessibleStage = getHighestAccessibleStage(workflowDecisions);
  const isFinalReviewConfirmed = workflowDecisions.some(
    (decision) => decision.decision_type === stepConfirmationType(10),
  );

  useEffect(() => {
    const activeWorkspace = getActiveWorkspace();
    if (activeWorkspace) {
      setAnalysis(activeWorkspace);
      setWorkspaceChecked(true);
      return;
    }
    const stored = sessionStorage.getItem("specloop-workspace");
    if (stored) {
      const workspace = JSON.parse(stored) as AnalyzeResponse;
      setActiveWorkspace(workspace);
      setAnalysis(workspace);
    }
    setWorkspaceChecked(true);
  }, []);

  useEffect(() => {
    if (!workspaceChecked) return;
    if (!analysis) {
      router.replace("/");
      return;
    }

    let cancelled = false;
    setWorkflowState("loading");
    void getDecisions(analysis.project_id)
      .then((decisions) => {
        if (cancelled) return;
        setWorkflowDecisions(decisions);
        setWorkflowState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setWorkflowState("error");
        router.replace("/");
      });

    return () => {
      cancelled = true;
    };
  }, [analysis?.project_id, router, workspaceChecked]);

  useEffect(() => {
    if (!analysis || workflowState !== "ready") return;
    if (
      !Number.isInteger(currentStage) ||
      currentStage < 2 ||
      currentStage > LAST_WORKFLOW_STAGE ||
      currentStage > accessibleStage
    ) {
      router.replace(getWorkflowPath(accessibleStage));
    }
  }, [analysis, accessibleStage, currentStage, router, workflowState]);

  useEffect(() => {
    if (!analysis) return;
    void Promise.all([
      getEvidence(analysis.project_id),
      getJudgeConsensus(analysis.project_id),
      getEvidenceAnalysis(analysis.project_id),
      getRelatedWork(analysis.project_id),
    ])
      .then(([records, nextConsensus, findings, relatedRecords]) => {
        setEvidence(records);
        setConsensus(nextConsensus);
        setEvidenceFindings(findings);
        setRelatedWork(relatedRecords);
      })
      .catch(() => undefined);
  }, [analysis?.project_id, analysis?.version]);

  useEffect(() => {
    if (!analysis || stage !== "3") return;
    const suggestedQuery = analysis.input_idea.trim();
    if (suggestedQuery.length < 3) return;

    let cancelled = false;
    setSourceQuery(suggestedQuery);
    setSearchState("searching");
    void searchSources(analysis.project_id, suggestedQuery)
      .then((sources) => {
        if (!cancelled) {
          setSourceResults(sources);
          setSearchState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setSearchState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [analysis?.project_id, stage]);

  useEffect(() => {
    if (!analysis || stage !== "8") return;
    void getCompiledSpec(analysis.project_id)
      .then(setCompiledSpec)
      .catch(() => setCompiledSpec(null));
  }, [analysis?.project_id, analysis?.version, stage]);

  function persistWorkspace(next: AnalyzeResponse) {
    setAnalysis(next);
    setActiveWorkspace(next);
    sessionStorage.setItem("specloop-workspace", JSON.stringify(next));
  }

  async function advanceStage(completedStage: number) {
    if (!analysis || completedStage > accessibleStage) return;
    if (completedStage < accessibleStage) {
      router.push(`/step/${completedStage + 1}`);
      return;
    }
    setAdvanceState("saving");
    try {
      const decision = await saveDecision(
        analysis.project_id,
        stepConfirmationType(completedStage),
        `User confirmed workflow step ${completedStage}.`,
      );
      setWorkflowDecisions((current) => [decision, ...current]);
      setAdvanceState("idle");
      router.push(
        completedStage === LAST_WORKFLOW_STAGE
          ? "/final"
          : `/step/${completedStage + 1}`,
      );
    } catch {
      setAdvanceState("error");
    }
  }

  const stageActions = (
    <StageActions
      advanceState={advanceState}
      onAdvance={advanceStage}
      stage={currentStage}
    />
  );

  async function applyRevision() {
    if (!analysis) return;
    const previousVersion = analysis.version;
    setRevisionState("saving");
    try {
      const canonicalSpec = await getCompiledSpec(analysis.project_id);
      const revised = await reviseSpec(
        analysis.project_id,
        canonicalSpec.content,
        revisionStrategy,
        customNote,
      );
      persistWorkspace({
        ...analysis,
        draft_spec: revised.revised_spec,
        judges: revised.judges,
        readiness_score: revised.readiness_score,
        version: revised.version,
        agent_runtime: revised.agent_runtime,
        judge_runs: revised.judge_runs,
      });
      const [nextConsensus, nextDiff] = await Promise.all([
        getJudgeConsensus(analysis.project_id),
        getVersionDiff(analysis.project_id, previousVersion, revised.version),
      ]);
      setConsensus(nextConsensus);
      setRevisionDiff(nextDiff);
      setRevisionState("done");
    } catch {
      setRevisionState("error");
    }
  }

  async function rerunJudges() {
    if (!analysis) return;
    setJudgeState("running");
    try {
      const result = await runLatestSpecJudges(analysis.project_id);
      persistWorkspace({
        ...analysis,
        judges: result.judges,
        judge_runs: result.judge_runs,
        readiness_score: result.readiness_score,
        agent_runtime: result.agent_runtime,
      });
      setConsensus(await getJudgeConsensus(analysis.project_id));
      setJudgeState("idle");
    } catch {
      setJudgeState("error");
    }
  }

  async function saveSource() {
    if (!analysis) return;
    setSourceState("saving");
    try {
      const record = await saveEvidence(analysis.project_id, sourceForm);
      setEvidence((records) => [record, ...records]);
      setEvidenceFindings(await getEvidenceAnalysis(analysis.project_id));
      setSourceForm({
        title: "",
        url: "",
        claim: "",
        passage: "",
        verdict: "INSUFFICIENT",
      });
      setSourceState("idle");
    } catch {
      setSourceState("error");
    }
  }

  async function selectGap(choice: string, value: string) {
    if (!analysis) return;
    setGapChoice(choice);
    setGapDecisionState("saving");
    try {
      await saveDecision(analysis.project_id, "RESEARCH_GAP", value);
      setGapDecisionState("idle");
    } catch {
      setGapDecisionState("error");
    }
  }

  async function confirmCard(card: AnalyzeResponse["cards"][number]) {
    if (!analysis || card.status === "CONFIRMED") return;
    setCardConfirmationState("saving");
    try {
      await saveDecision(
        analysis.project_id,
        "CARD_CONFIRMATION",
        JSON.stringify({
          type: card.type,
          content: card.content,
          status: "CONFIRMED",
        }),
      );
      persistWorkspace({
        ...analysis,
        cards: analysis.cards.map((item) =>
          item === card ? { ...item, status: "CONFIRMED" } : item,
        ),
      });
      setCardConfirmationState("idle");
    } catch {
      setCardConfirmationState("error");
    }
  }

  async function findSources() {
    if (!analysis || sourceQuery.trim().length < 3) return;
    setSearchState("searching");
    try {
      setSourceResults(await searchSources(analysis.project_id, sourceQuery));
      setSearchState("idle");
    } catch {
      setSearchState("error");
    }
  }

  async function saveRelatedWorkSource() {
    if (!analysis) return;
    setRelatedWorkState("saving");
    try {
      const record = await saveRelatedWork(
        analysis.project_id,
        relatedWorkForm,
      );
      setRelatedWork((records) => [record, ...records]);
      setRelatedWorkForm({
        title: "",
        url: "",
        year: null,
        approach: "",
        limitation: "",
      });
      setShowRelatedWorkForm(false);
      setRelatedWorkState("idle");
    } catch {
      setRelatedWorkState("error");
    }
  }

  if (!workspaceChecked || workflowState === "loading")
    return <main className="workspace-pending" aria-busy="true" />;

  if (!analysis || workflowState === "error")
    return <main className="workspace-pending" aria-busy="true" />;

  return (
    <>
      <RouteHeader />
      <main className="route-page">
        <Wizard current={stage} accessibleStage={accessibleStage} />
        <p className="route-project">
          Research workspace: {analysis.project_id} · Readiness{" "}
          {analysis.readiness_score}/100
        </p>
        <section className="route-title">
          <div className="step-icon">
            {stage === "2"
              ? "▦"
              : stage === "3"
                ? "⌕"
                : stage === "4"
                  ? "◎"
                  : stage === "9"
                    ? "⚖"
                    : "◇"}
          </div>
          <div>
            <h1>{config.title}</h1>
            <p>{config.subtitle}</p>
          </div>
        </section>
        {stage === "2" ? (
          <>
            <section className="decomposition-toolbar">
              <span>Trạng thái thẻ</span>
              {Object.entries(STATUS_LABELS).map(([status, label]) => (
                <span
                  className={`status-chip ${status.toLowerCase()}`}
                  key={status}
                >
                  {label}
                </span>
              ))}
            </section>
            <section className="card-grid decomposition-grid">
              {analysis.cards.map((card) => (
                <article
                  className="card spec-card"
                  key={`${card.type}-${card.content}`}
                >
                  <div>
                    <span className="card-type">{card.type}</span>
                    <span
                      className={`status-chip ${card.status.toLowerCase()}`}
                    >
                      {STATUS_LABELS[card.status]}
                    </span>
                  </div>
                  <p>{card.content}</p>
                  <button
                    className="text-action"
                    disabled={
                      card.status === "CONFIRMED" ||
                      cardConfirmationState === "saving"
                    }
                    onClick={() => void confirmCard(card)}
                  >
                    {card.status === "CONFIRMED"
                      ? "Đã xác nhận"
                      : "Xác nhận thẻ"}
                  </button>
                </article>
              ))}
            </section>
            {cardConfirmationState === "error" ? (
              <p className="form-error">Không thể lưu xác nhận thẻ.</p>
            ) : null}
            {stageActions}
          </>
        ) : null}
        {stage === "3" ? (
          <>
            <div className="route-grid research-grid">
              <section className="card">
                <h2>Từ khóa & quản lý nguồn</h2>
                <p className="small">
                  Nguồn được tạo hoặc truy xuất cho ý tưởng:{" "}
                  {analysis.input_idea}
                </p>
                <p className="citation-note">
                  {relatedWork.length
                    ? `${relatedWork.length} nguồn đã lưu, cần được kiểm tra trước khi khẳng định novelty.`
                    : "Chưa có nguồn đã xác minh. Bổ sung related work trước khi chốt novelty claim."}
                </p>
                <p className="source-disclaimer">
                  Gợi ý bên dưới lấy metadata thật từ OpenAlex, với Crossref làm
                  fallback. Metadata không tự động là evidence đã xác minh.
                </p>
                <div className="source-form">
                  <input
                    className="route-input"
                    value={sourceQuery}
                    onChange={(event) => setSourceQuery(event.target.value)}
                    placeholder="Từ khóa, tác giả hoặc tiêu đề để tìm Crossref"
                  />
                  <button
                    className="text-action"
                    disabled={
                      searchState === "searching" ||
                      sourceQuery.trim().length < 3
                    }
                    onClick={findSources}
                  >
                    {searchState === "searching"
                      ? "Đang tìm..."
                      : "Tìm nguồn khác"}
                  </button>
                  {searchState === "error" ? (
                    <p className="form-error">
                      Không thể tìm Crossref. Bạn vẫn có thể nhập nguồn thủ
                      công.
                    </p>
                  ) : null}
                  <button
                    className="text-action"
                    onClick={() => {
                      setRelatedWorkForm({
                        title: "",
                        url: "",
                        year: null,
                        approach: "",
                        limitation: "",
                      });
                      setShowRelatedWorkForm(true);
                    }}
                  >
                    Nhập nguồn thủ công
                  </button>
                </div>
              </section>
              <section className="card">
                <h2>Nguồn học thuật & bảng related work</h2>
                <div className="compact-table">
                  {relatedWork.length ? (
                    relatedWork.map((paper) => (
                      <article key={paper.title}>
                        <strong>
                          {paper.title} {paper.year ? `(${paper.year})` : ""}
                        </strong>
                        <span>{paper.approach}</span>
                        <small>{paper.limitation}</small>
                        <a href={paper.url} target="_blank" rel="noreferrer">
                          Nguồn
                        </a>
                      </article>
                    ))
                  ) : (
                    <p className="small">
                      AI chưa cung cấp nguồn có thể kiểm chứng cho ý tưởng này.
                    </p>
                  )}
                </div>
                <section className="source-candidates" aria-live="polite">
                  <h3>Nguồn gợi ý theo ý tưởng</h3>
                  {searchState === "searching" ? (
                    <p className="small">
                      Đang truy xuất metadata học thuật...
                    </p>
                  ) : null}
                  {searchState === "idle" && sourceResults.length === 0 ? (
                    <p className="small">
                      Chưa tìm thấy metadata phù hợp. Hãy thử rút gọn từ khóa
                      hoặc thêm nguồn thủ công.
                    </p>
                  ) : null}
                  {sourceResults.map((source) => (
                    <article
                      className="mini-record source-result"
                      key={source.url}
                    >
                      <div className="source-result-header">
                        <strong>{source.title}</strong>
                        <span>{source.source_provider}</span>
                      </div>
                      <p className="small">
                        {source.authors} {source.year ? `(${source.year})` : ""}
                      </p>
                      <div className="source-result-meta">
                        {source.venue ? <span>{source.venue}</span> : null}
                        <span>
                          {source.cited_by_count.toLocaleString()} citations
                        </span>
                        {source.is_open_access ? (
                          <span>Open access</span>
                        ) : null}
                      </div>
                      <div className="source-result-actions">
                        <a href={source.url} target="_blank" rel="noreferrer">
                          Mở DOI / metadata
                        </a>
                        <button
                          className="text-action"
                          onClick={() => {
                            setRelatedWorkForm({
                              title: source.title,
                              url: source.url,
                              year: source.year,
                              approach: "",
                              limitation: "",
                            });
                            setShowRelatedWorkForm(true);
                            setSourceForm({
                              ...sourceForm,
                              title: source.title,
                              url: source.url,
                            });
                          }}
                        >
                          Thêm vào related work
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
                {showRelatedWorkForm || relatedWorkForm.title ? (
                  <div className="source-form">
                    <strong>Thêm vào bảng related work</strong>
                    <input
                      className="route-input"
                      value={relatedWorkForm.title}
                      onChange={(event) =>
                        setRelatedWorkForm({
                          ...relatedWorkForm,
                          title: event.target.value,
                        })
                      }
                      placeholder="Tiêu đề công trình"
                    />
                    <input
                      className="route-input"
                      value={relatedWorkForm.url}
                      onChange={(event) =>
                        setRelatedWorkForm({
                          ...relatedWorkForm,
                          url: event.target.value,
                        })
                      }
                      placeholder="URL hoặc DOI"
                    />
                    <input
                      className="route-input"
                      type="number"
                      value={relatedWorkForm.year ?? ""}
                      onChange={(event) =>
                        setRelatedWorkForm({
                          ...relatedWorkForm,
                          year: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                      placeholder="Năm xuất bản (không bắt buộc)"
                    />
                    <textarea
                      className="route-input"
                      value={relatedWorkForm.approach}
                      onChange={(event) =>
                        setRelatedWorkForm({
                          ...relatedWorkForm,
                          approach: event.target.value,
                        })
                      }
                      placeholder="Approach hoặc phương pháp của công trình"
                    />
                    <textarea
                      className="route-input"
                      value={relatedWorkForm.limitation}
                      onChange={(event) =>
                        setRelatedWorkForm({
                          ...relatedWorkForm,
                          limitation: event.target.value,
                        })
                      }
                      placeholder="Limitation liên quan đến research gap"
                    />
                    <button
                      className="text-action"
                      disabled={
                        relatedWorkState === "saving" ||
                        relatedWorkForm.title.trim().length < 3 ||
                        relatedWorkForm.url.trim().length < 8 ||
                        relatedWorkForm.approach.trim().length < 3 ||
                        relatedWorkForm.limitation.trim().length < 3
                      }
                      onClick={saveRelatedWorkSource}
                    >
                      {relatedWorkState === "saving"
                        ? "Đang lưu..."
                        : "Lưu vào bảng related work"}
                    </button>
                    {relatedWorkState === "error" ? (
                      <p className="form-error">Không thể lưu related work.</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="source-form">
                  <input
                    className="route-input"
                    value={sourceForm.title}
                    onChange={(event) =>
                      setSourceForm({
                        ...sourceForm,
                        title: event.target.value,
                      })
                    }
                    placeholder="Tiêu đề nguồn"
                  />
                  <input
                    className="route-input"
                    value={sourceForm.url}
                    onChange={(event) =>
                      setSourceForm({ ...sourceForm, url: event.target.value })
                    }
                    placeholder="URL nguồn"
                  />
                  <textarea
                    className="route-input"
                    value={sourceForm.claim}
                    onChange={(event) =>
                      setSourceForm({
                        ...sourceForm,
                        claim: event.target.value,
                      })
                    }
                    placeholder="Claim cần kiểm chứng"
                  />
                  <textarea
                    className="route-input"
                    value={sourceForm.passage}
                    onChange={(event) =>
                      setSourceForm({
                        ...sourceForm,
                        passage: event.target.value,
                      })
                    }
                    placeholder="Đoạn trích evidence"
                  />
                  <select
                    value={sourceForm.verdict}
                    onChange={(event) =>
                      setSourceForm({
                        ...sourceForm,
                        verdict: event.target
                          .value as EvidenceRecord["verdict"],
                      })
                    }
                  >
                    <option value="SUPPORTED">SUPPORTED</option>
                    <option value="CONTRADICTED">CONTRADICTED</option>
                    <option value="INSUFFICIENT">INSUFFICIENT</option>
                  </select>
                  <button
                    className="text-action"
                    disabled={sourceState === "saving"}
                    onClick={saveSource}
                  >
                    {sourceState === "saving"
                      ? "Đang lưu nguồn..."
                      : "Lưu nguồn & evidence"}
                  </button>
                  {sourceState === "error" ? (
                    <p className="form-error">Không thể lưu evidence.</p>
                  ) : null}
                </div>
                {evidence.map((record) => (
                  <article className="mini-record" key={record.id}>
                    <strong>{record.title}</strong> ·{" "}
                    <a href={record.url} target="_blank" rel="noreferrer">
                      Nguồn
                    </a>
                    <p>{record.claim}</p>
                    <small
                      className={`evidence-status ${record.verdict.toLowerCase()}`}
                    >
                      {record.verdict}: {record.passage}
                    </small>
                  </article>
                ))}
                {evidenceFindings.length ? (
                  <div className="evidence-findings">
                    <h3>Ambiguity & conflict cần xử lý</h3>
                    {evidenceFindings.map((finding) => (
                      <p
                        className={`evidence-status ${finding.kind.toLowerCase()}`}
                        key={`${finding.kind}-${finding.claim}`}
                      >
                        <b>{finding.kind}:</b> {finding.claim}. {finding.detail}
                      </p>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
            {stageActions}
          </>
        ) : null}
        {stage === "4" ? (
          <>
            <div className="route-grid research-grid">
              <section className="card">
                <h2>Gap candidate có thể kiểm nghiệm</h2>
                <p>{gapCard?.content}</p>
                <h3>Vì sao đây là gap?</h3>
                <p className="small">
                  {relatedWork.length
                    ? "Các limitation dưới đây được ghi nhận từ bảng related work đã lưu. Chỉ chọn gap khi limitation có ý nghĩa và kiểm tra được bằng thí nghiệm."
                    : "Chưa có related work đã lưu. Hãy thêm ít nhất một nguồn có approach và limitation trước khi chốt novelty claim."}
                </p>
                {relatedWork.length ? (
                  <div className="gap-evidence-list">
                    {relatedWork.map((paper) => (
                      <article key={paper.id}>
                        <strong>{paper.title}</strong>
                        <p>
                          <b>Đã làm:</b> {paper.approach}
                        </p>
                        <p>
                          <b>Limitation:</b> {paper.limitation}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : null}
                {evidenceFindings.length ? (
                  <div className="gap-finding-list">
                    {evidenceFindings.map((finding) => (
                      <p key={`${finding.kind}-${finding.claim}`}>
                        <b>{finding.kind}:</b> {finding.detail}
                      </p>
                    ))}
                  </div>
                ) : null}
                <h3>Cách kiểm nghiệm</h3>
                <p className="small">
                  {analysis.experiment_plan[0]?.purpose ??
                    "So sánh approach được đề xuất với baseline trên cùng dữ liệu, metric và resource budget."}
                </p>
              </section>
              <section className="card">
                <h2>Chọn hướng contribution</h2>
                {[
                  [
                    "focus-gap",
                    "A",
                    "Giải quyết gap đã xác minh",
                    gapCard?.content ?? "Đối chiếu limitation từ related work.",
                  ],
                  [
                    "measure-outcome",
                    "B",
                    "Ưu tiên kết quả có thể đo",
                    "Chốt baseline, metric và điều kiện bác bỏ trước khi mở rộng claim.",
                  ],
                  [
                    "evidence-first",
                    "C",
                    "Ưu tiên evidence",
                    "Thu thập nguồn và quote độc lập trước khi xác nhận novelty.",
                  ],
                  [
                    "other",
                    "D",
                    "Other",
                    "Nhập contribution hoặc hướng gap riêng.",
                  ],
                ].map(([key, label, title, detail]) => (
                  <button
                    className={
                      gapChoice === key
                        ? "choice-choice selected"
                        : "choice-choice"
                    }
                    disabled={gapDecisionState === "saving"}
                    onClick={() => {
                      if (key === "other") {
                        setGapChoice(key);
                        return;
                      }
                      void selectGap(
                        key,
                        key === "focus-gap" ? `${title}: ${detail}` : title,
                      );
                    }}
                    key={key}
                  >
                    <strong>
                      {label}. {title}
                    </strong>
                    <small>{detail}</small>
                  </button>
                ))}
                {gapChoice === "other" ? (
                  <input
                    className="route-input"
                    placeholder="Nhập hướng research riêng"
                    value={customGap}
                    onChange={(event) => setCustomGap(event.target.value)}
                    onBlur={() => {
                      if (customGap.trim().length >= 3)
                        void selectGap("other", customGap.trim());
                    }}
                  />
                ) : null}
                {gapDecisionState === "error" ? (
                  <p className="form-error">Không thể lưu research gap.</p>
                ) : null}
              </section>
            </div>
            {stageActions}
          </>
        ) : null}
        {stage === "5" ? (
          <>
            <div className="route-grid contribution-grid">
              <section className="card">
                <h2>Expected contributions</h2>
                <ol className="numbered-list">
                  {contributionCards?.map((card) => (
                    <li key={card.type}>{card.content}</li>
                  ))}
                </ol>
              </section>
              <section className="card">
                <h2>Claim - Evidence Card</h2>
                {analysis.claim_evidence.map((item) => (
                  <article className="mini-record" key={item.claim}>
                    <strong>Claim: {item.claim}</strong>
                    <p>
                      <b>Baseline:</b> {item.baseline}
                    </p>
                    <p>
                      <b>Metric:</b> {item.metric}
                    </p>
                    <p>
                      <b>Evidence:</b> {item.evidence_needed}
                    </p>
                    <p
                      className={`evidence-status ${item.verification.toLowerCase()}`}
                    >
                      <b>Xác minh:</b> {item.verification} ·{" "}
                      {item.verification_rationale}
                    </p>
                    <small>
                      <b>Bác bỏ khi:</b> {item.falsification}
                    </small>
                  </article>
                ))}
              </section>
            </div>
            {stageActions}
          </>
        ) : null}
        {stage === "6" ? (
          <>
            <div className="route-grid contribution-grid">
              <section className="card">
                <h2>Kế hoạch thí nghiệm</h2>
                {analysis.experiment_plan.map((plan, index) => (
                  <article className="experiment-row" key={plan.experiment}>
                    <b>TN{index + 1}</b>
                    <div>
                      <strong>{plan.experiment}</strong>
                      <p>{plan.purpose}</p>
                      <ul>
                        {plan.setup.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </section>
              <section className="card">
                <h2>Metrics & điều kiện công bằng</h2>
                <div className="metric-list">
                  {analysis.claim_evidence.map((item) => (
                    <span key={item.metric}>{item.metric}</span>
                  ))}
                </div>
                <p>
                  So sánh các baseline và điều kiện đánh giá được xác định từ
                  claim-evidence của workspace này.
                </p>
              </section>
            </div>
            {stageActions}
          </>
        ) : null}
        {stage === "7" ? (
          <>
            <div className="route-grid budget-grid">
              <section className="card">
                <h2>Cấu hình đề xuất</h2>
                <dl className="budget-list">
                  <dt>Resource</dt>
                  <dd>{analysis.compute_budget.target_resource}</dd>
                  <dt>Model profile</dt>
                  <dd>{analysis.compute_budget.model}</dd>
                  <dt>VRAM ước lượng</dt>
                  <dd>{analysis.compute_budget.estimated_vram_gb} GB</dd>
                  <dt>Seed prompts</dt>
                  <dd>{analysis.compute_budget.seed_prompts}</dd>
                  <dt>Candidate / vòng</dt>
                  <dd>{analysis.compute_budget.candidates_per_round}</dd>
                  <dt>Số vòng</dt>
                  <dd>{analysis.compute_budget.optimization_rounds}</dd>
                  <dt>Development / validation</dt>
                  <dd>
                    {analysis.compute_budget.development_samples} /{" "}
                    {analysis.compute_budget.validation_samples} mẫu
                  </dd>
                  <dt>Top candidates</dt>
                  <dd>{analysis.compute_budget.top_candidates}</dd>
                  <dt>Phạm vi</dt>
                  <dd>{analysis.input_idea}</dd>
                </dl>
              </section>
              <section className="card">
                <h2>Ước lượng chi phí</h2>
                <dl className="budget-list">
                  <dt>Thời gian</dt>
                  <dd>~{analysis.compute_budget.estimated_hours} giờ</dd>
                  <dt>LLM calls</dt>
                  <dd>
                    {analysis.compute_budget.estimated_llm_calls.toLocaleString()}
                  </dd>
                  <dt>Token / API budget</dt>
                  <dd>
                    {analysis.compute_budget.estimated_token_budget.toLocaleString()}
                  </dd>
                </dl>
                <p className="citation-note">
                  {analysis.compute_budget.recommendation}
                </p>
                <p className="budget-warning">
                  {analysis.compute_budget.reduction_suggestion}
                </p>
              </section>
            </div>
            {stageActions}
          </>
        ) : null}
        {stage === "8" ? (
          <>
            <div className="route-grid spec-grid">
              <section className="card">
                <h2>Trạng thái research spec</h2>
                {compiledSpec ? (
                  <div className="spec-section-list">
                    {compiledSpec.sections.map((section) => (
                      <article
                        className={`spec-section-status ${section.status.toLowerCase()}`}
                        key={section.key}
                      >
                        <span>{SPEC_STATUS_LABELS[section.status]}</span>
                        <div>
                          <strong>{section.title}</strong>
                          <p>{section.detail}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="small">
                    Đang tổng hợp trạng thái từ nguồn, evidence và decision đã
                    lưu.
                  </p>
                )}
                {compiledSpec?.blockers.length ? (
                  <div className="spec-blockers">
                    <strong>Cần xử lý trước khi chốt:</strong>
                    <ul>
                      {compiledSpec.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
              <section className="card draft-spec">
                <h2>
                  Bản research spec v{compiledSpec?.version ?? analysis.version}
                </h2>
                <pre>{compiledSpec?.content ?? analysis.draft_spec}</pre>
              </section>
            </div>
            {stageActions}
          </>
        ) : null}
        {stage === "9" ? (
          <>
            <section className="card">
              <h2>Panel Judge độc lập</h2>
              <p className="small">
                Mỗi Judge đánh giá riêng trước khi xem nhận xét của Judge khác.
              </p>
              <div className="agent-runtime">
                <strong>
                  Provider configured:{" "}
                  {analysis.agent_runtime.mode === "live"
                    ? "Live LLM"
                    : "Mock fallback"}
                </strong>
                <span>
                  {analysis.agent_runtime.provider} ·{" "}
                  {analysis.agent_runtime.model}
                </span>
              </div>
              <p className="small">
                Mỗi lần chạy lại gọi các Judge với context riêng. Nếu provider
                quá chậm hoặc trả JSON không hợp lệ, hệ thống dùng deterministic
                fallback thay vì giữ workflow ở trạng thái chờ.
              </p>
              <button
                className="text-action"
                disabled={judgeState === "running"}
                onClick={rerunJudges}
              >
                {judgeState === "running"
                  ? "Đang chạy Judge..."
                  : "Chạy lại Judge cho Spec mới nhất"}
              </button>
              {judgeState === "error" ? (
                <p className="form-error">
                  Không thể chạy Judge. Hãy kiểm tra API và cấu hình provider.
                </p>
              ) : null}
              <div className="judge-row">
                {analysis.judges.map((judge, index) => (
                  <article key={judge.judge}>
                    <b>Judge {index + 1}</b>
                    <strong>{judge.judge}</strong>
                    <p>{judge.issue}</p>
                    <small>{judge.severity}</small>
                    <p>{judge.rationale}</p>
                    <span>{judge.recommendation}</span>
                    <em>
                      Spec v
                      {analysis.judge_runs.find(
                        (run) => run.judge === judge.judge,
                      )?.spec_version_used ?? analysis.version}
                    </em>
                  </article>
                ))}
              </div>
            </section>
            <section className="consensus-box">
              {consensus ? (
                <>
                  <div className="consensus-heading">
                    <div>
                      <strong>
                        Đồng thuận cho Spec v{consensus.spec_version_used}
                      </strong>
                      <p>{consensus.consensus}</p>
                    </div>
                    <span className="consensus-score">
                      {consensus.agreement_score}% đồng thuận
                    </span>
                  </div>
                  <div className="consensus-metrics">
                    <span>{consensus.judge_count} Judge</span>
                    <span>{consensus.major_count} MAJOR</span>
                    <span>{consensus.minor_count} MINOR</span>
                  </div>
                  <div className="consensus-details">
                    <div>
                      <h3>Nhận định chung</h3>
                      <ul>
                        {consensus.agreed_findings.map((finding) => (
                          <li key={finding}>{finding}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3>Bất đồng</h3>
                      {consensus.disagreements.length ? (
                        <ul>
                          {consensus.disagreements.map((finding) => (
                            <li key={finding}>{finding}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>Không có severity split trong lần chạy này.</p>
                      )}
                    </div>
                  </div>
                  <details className="role-findings">
                    <summary>Nhận xét theo từng role</summary>
                    <ul>
                      {consensus.role_findings.map((finding) => (
                        <li key={finding}>{finding}</li>
                      ))}
                    </ul>
                  </details>
                </>
              ) : (
                <p>Đang tải tổng hợp Judge.</p>
              )}
            </section>
            {stageActions}
          </>
        ) : null}
        {stage === "10" ? (
          <div className="route-grid contribution-grid">
            <section className="card">
              <h2>Xử lý nhận xét Judge</h2>
              <p>
                Chọn cách xử lý cho các finding, evidence và Judge feedback của
                workspace hiện tại:
              </p>
              {[
                [
                  "NARROW_CLAIM",
                  "A. Thu hẹp claim",
                  "Giới hạn kết luận theo evidence và điều kiện đánh giá đã có.",
                ],
                [
                  "EXPAND_EXPERIMENT",
                  "B. Mở rộng thí nghiệm",
                  "Bổ sung baseline, ablation hoặc split cần thiết để kiểm tra claim.",
                ],
                [
                  "TURN_INTO_QUESTION",
                  "C. Chuyển thành research question",
                  "Không khẳng định trước khi có bằng chứng.",
                ],
                ["CUSTOM", "D. Other", "Nhập hướng riêng."],
              ].map(([value, title, detail]) => (
                <button
                  className={
                    revisionStrategy === value
                      ? "choice-choice selected"
                      : "choice-choice"
                  }
                  onClick={() =>
                    setRevisionStrategy(value as typeof revisionStrategy)
                  }
                  key={value}
                >
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </button>
              ))}
              {revisionStrategy === "CUSTOM" ? (
                <textarea
                  className="route-input"
                  value={customNote}
                  onChange={(event) => setCustomNote(event.target.value)}
                  placeholder="Mô tả quyết định sửa đổi"
                />
              ) : null}
              <button
                className="primary-action"
                disabled={revisionState === "saving"}
                onClick={applyRevision}
              >
                {revisionState === "saving"
                  ? "Đang tạo phiên bản..."
                  : "Áp dụng sửa đổi & chạy Judge lại"}
              </button>
              {revisionState === "done" ? (
                <p className="success-message">
                  Đã tạo phiên bản {analysis.version}.
                </p>
              ) : null}
              {revisionState === "error" ? (
                <p className="error-message">
                  Không thể tạo revision. Hãy thử lại.
                </p>
              ) : null}
            </section>
            <section className="card">
              <h2>Phiên bản hiện tại</h2>
              <p>
                Version {analysis.version} · Readiness{" "}
                {analysis.readiness_score}/100
              </p>
              <pre className="revision-preview">{analysis.draft_spec}</pre>
              {revisionDiff ? (
                <div className="revision-diff">
                  <h3>
                    Diff v{revisionDiff.from_version} → v
                    {revisionDiff.to_version}
                  </h3>
                  <pre>
                    {revisionDiff.diff_lines.join("\n") ||
                      "Không có thay đổi nội dung."}
                  </pre>
                </div>
              ) : null}
              <button
                className="next-route"
                disabled={advanceState === "saving"}
                onClick={() => void advanceStage(10)}
                type="button"
              >
                {isFinalReviewConfirmed
                  ? "Xem & xuất bản spec cuối →"
                  : advanceState === "saving"
                    ? "Đang lưu checkpoint..."
                    : "Xác nhận review & sang xuất bản →"}
              </button>
            </section>
          </div>
        ) : null}
      </main>
    </>
  );
}
