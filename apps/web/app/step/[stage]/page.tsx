"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { RouteHeader } from "@/components/RouteHeader";
import {
  getActiveWorkspace,
  getEvidence,
  getJudgeConsensus,
  reviseSpec,
  runLatestSpecJudges,
  saveDecision,
  saveEvidence,
  setActiveWorkspace,
  type AnalyzeResponse,
  type EvidenceRecord,
  type JudgeConsensus,
} from "@/lib/api";

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

function Wizard({ current }: { current: string }) {
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
      ].map(([number, label, href]) => (
        <Link
          className={current === number ? "route-step active" : "route-step"}
          href={href}
          key={number}
        >
          <b>{Number(current) > Number(number) ? "✓" : number}</b>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function StageActions({ stage }: { stage: number }) {
  return (
    <div className="route-actions">
      <Link
        className="secondary-route"
        href={stage === 2 ? "/" : `/step/${stage - 1}`}
      >
        ← Quay lại
      </Link>
      {stage < 10 ? (
        <Link className="next-route" href={`/step/${stage + 1}`}>
          Xác nhận & tiếp tục →
        </Link>
      ) : null}
    </div>
  );
}

export default function StagePage() {
  const params = useParams<{ stage: string }>();
  const stage = params.stage;
  const config = STAGES[stage] ?? STAGES["2"];
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(
    getActiveWorkspace,
  );
  const [workspaceChecked, setWorkspaceChecked] = useState(
    Boolean(getActiveWorkspace()),
  );
  const [gapChoice, setGapChoice] = useState("B");
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
  const [consensus, setConsensus] = useState<JudgeConsensus | null>(null);
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

  useEffect(() => {
    if (getActiveWorkspace()) return;
    const stored = sessionStorage.getItem("specloop-workspace");
    if (stored) {
      const workspace = JSON.parse(stored) as AnalyzeResponse;
      setActiveWorkspace(workspace);
      setAnalysis(workspace);
    }
    setWorkspaceChecked(true);
  }, []);

  useEffect(() => {
    if (!analysis) return;
    void Promise.all([
      getEvidence(analysis.project_id),
      getJudgeConsensus(analysis.project_id),
    ])
      .then(([records, nextConsensus]) => {
        setEvidence(records);
        setConsensus(nextConsensus);
      })
      .catch(() => undefined);
  }, [analysis?.project_id]);

  function persistWorkspace(next: AnalyzeResponse) {
    setAnalysis(next);
    setActiveWorkspace(next);
    sessionStorage.setItem("specloop-workspace", JSON.stringify(next));
  }

  async function applyRevision() {
    if (!analysis) return;
    setRevisionState("saving");
    try {
      const revised = await reviseSpec(
        analysis.project_id,
        analysis.draft_spec,
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

  async function selectGap(value: string) {
    if (!analysis) return;
    setGapChoice(value);
    try {
      await saveDecision(analysis.project_id, "RESEARCH_GAP", value);
    } catch {
      setJudgeState("error");
    }
  }

  if (!workspaceChecked)
    return <main className="workspace-pending" aria-busy="true" />;

  if (!analysis)
    return (
      <main className="empty-workspace">
        <h1>Chưa có research workspace</h1>
        <p>
          Hãy bắt đầu từ ý tưởng nghiên cứu để hệ thống tạo dữ liệu cho các bước
          tiếp theo.
        </p>
        <a href="/">Quay lại bước 1</a>
      </main>
    );

  return (
    <>
      <RouteHeader />
      <main className="route-page">
        <Wizard current={stage} />
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
                    onClick={() =>
                      persistWorkspace({
                        ...analysis,
                        cards: analysis.cards.map((item) =>
                          item === card
                            ? { ...item, status: "CONFIRMED" }
                            : item,
                        ),
                      })
                    }
                  >
                    Xác nhận thẻ
                  </button>
                </article>
              ))}
              <article className="card spec-card open-card">
                <span className="card-type">Open question</span>
                <p>{analysis.input_idea}</p>
                <span className="status-chip ambiguous">Mơ hồ</span>
              </article>
            </section>
            <StageActions stage={Number(stage)} />
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
                  {analysis.related_work.length
                    ? `${analysis.related_work.length} nguồn cần được kiểm tra trước khi khẳng định novelty.`
                    : "Chưa có nguồn đã xác minh. Bổ sung related work trước khi chốt novelty claim."}
                </p>
              </section>
              <section className="card">
                <h2>Bảng đối sánh related work</h2>
                <div className="compact-table">
                  {analysis.related_work.length ? (
                    analysis.related_work.map((paper) => (
                      <article key={paper.title}>
                        <strong>
                          {paper.title} ({paper.year})
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
              </section>
            </div>
            <StageActions stage={Number(stage)} />
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
                  Gap chỉ được xác nhận sau khi đối chiếu related work sinh từ ý
                  tưởng của bạn.
                </p>
              </section>
              <section className="card">
                <h2>Chọn hướng contribution</h2>
                {[
                  [
                    "A",
                    "Thuật toán tối ưu prompt",
                    "Mutation, selection hoặc search.",
                  ],
                  [
                    "B",
                    "Claim-evidence verifier",
                    "Kiểm tra hallucination ở mức claim.",
                  ],
                  [
                    "C",
                    "Human-in-the-loop",
                    "Người dùng xác nhận và điều chỉnh loop.",
                  ],
                  [
                    "D",
                    "Kết hợp các hướng",
                    "Một contribution chính và contribution phụ.",
                  ],
                  ["E", "Other", "Nhập hướng riêng."],
                ].map(([key, title, detail]) => (
                  <button
                    className={
                      gapChoice === key
                        ? "choice-choice selected"
                        : "choice-choice"
                    }
                    onClick={() => void selectGap(key)}
                    key={key}
                  >
                    <strong>
                      {key}. {title}
                    </strong>
                    <small>{detail}</small>
                  </button>
                ))}
                {gapChoice === "E" ? (
                  <input
                    className="route-input"
                    placeholder="Nhập hướng research riêng"
                  />
                ) : null}
              </section>
            </div>
            <StageActions stage={Number(stage)} />
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
            <StageActions stage={Number(stage)} />
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
            <StageActions stage={Number(stage)} />
          </>
        ) : null}
        {stage === "7" ? (
          <>
            <div className="route-grid contribution-grid">
              <section className="card">
                <h2>Cấu hình đề xuất</h2>
                <dl className="budget-list">
                  <dt>Resource</dt>
                  <dd>{analysis.compute_budget.target_resource}</dd>
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
              </section>
            </div>
            <StageActions stage={Number(stage)} />
          </>
        ) : null}
        {stage === "8" ? (
          <>
            <div className="route-grid contribution-grid">
              <section className="card">
                <h2>Research spec checklist</h2>
                <ol className="numbered-list">
                  {[
                    "Problem statement",
                    "Research questions",
                    "Related-work matrix",
                    "Research gap",
                    "Proposed approach",
                    "Expected contributions",
                    "Claim-evidence matrix",
                    "Experimental protocol",
                    "Baselines & metrics",
                    "Ablation plan",
                    "Compute budget",
                    "Risks & limitations",
                    "Open issues",
                    "Decision history",
                  ].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </section>
              <section className="card draft-spec">
                <h2>Bản spec tạm thời</h2>
                <pre>{analysis.draft_spec}</pre>
              </section>
            </div>
            <StageActions stage={Number(stage)} />
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
                  Agent runtime:{" "}
                  {analysis.agent_runtime.mode === "live"
                    ? "Live LLM"
                    : "Mock fallback"}
                </strong>
                <span>
                  {analysis.agent_runtime.provider} ·{" "}
                  {analysis.agent_runtime.model}
                </span>
              </div>
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
              <strong>
                Đồng thuận cho Spec v
                {consensus?.spec_version_used ?? analysis.version}:
              </strong>{" "}
              {consensus?.consensus ?? "Đang tải tổng hợp Judge."}
              {consensus ? (
                <span>
                  {" "}
                  {consensus.major_count} major, {consensus.minor_count} minor.
                  Bất đồng/vấn đề: {consensus.disagreements.join(" | ")}
                </span>
              ) : null}
            </section>
            <StageActions stage={Number(stage)} />
          </>
        ) : null}
        {stage === "10" ? (
          <div className="route-grid contribution-grid">
            <section className="card">
              <h2>Xử lý nhận xét Judge</h2>
              <p>
                Claim hiện tại có phạm vi rộng hơn bằng chứng đang có. Chọn một
                cách xử lý:
              </p>
              {[
                [
                  "NARROW_CLAIM",
                  "A. Thu hẹp claim",
                  "Chỉ khẳng định kết quả trên paper khoa học.",
                ],
                [
                  "EXPAND_EXPERIMENT",
                  "B. Mở rộng thí nghiệm",
                  "Bổ sung thêm domain tài chính hoặc bất động sản.",
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
              <Link className="next-route" href="/final">
                Xem & xuất bản spec cuối →
              </Link>
            </section>
          </div>
        ) : null}
      </main>
    </>
  );
}
