"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CardList } from "@/components/CardList";
import { JudgePanel } from "@/components/JudgePanel";
import {
  AnalyzeResponse,
  VersionHistoryItem,
  analyzeIdea,
  getActiveWorkspace,
  getProjectHistory,
  reviseSpec,
  setActiveWorkspace,
} from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [resource, setResource] = useState("RTX 3090");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [projectId, setProjectId] = useState("");
  const [history, setHistory] = useState<VersionHistoryItem[]>([]);
  const [revision, setRevision] = useState<string>("");
  const [version, setVersion] = useState(1);
  const [readinessScore, setReadinessScore] = useState<number | null>(null);
  const [currentJudges, setCurrentJudges] = useState<AnalyzeResponse["judges"]>(
    [],
  );
  const [strategy, setStrategy] = useState<
    "NARROW_CLAIM" | "EXPAND_EXPERIMENT" | "TURN_INTO_QUESTION" | "CUSTOM"
  >("NARROW_CLAIM");
  const [customNote, setCustomNote] = useState("");
  const [changeLog, setChangeLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [userName, setUserName] = useState("");
  const [activeStage, setActiveStage] = useState(1);

  const currentDraft = useMemo(
    () => revision || analysis?.draft_spec || "",
    [analysis, revision],
  );

  useEffect(() => {
    const session = localStorage.getItem("specloop-session");
    if (session) setUserName(JSON.parse(session).name);
  }, []);

  useEffect(() => {
    const cachedWorkspace = getActiveWorkspace();
    const storedWorkspace = sessionStorage.getItem("specloop-workspace");
    const workspace =
      cachedWorkspace ?? (storedWorkspace ? JSON.parse(storedWorkspace) : null);
    if (!workspace) return;

    const restored = workspace as AnalyzeResponse;
    setActiveWorkspace(restored);
    setAnalysis(restored);
    setIdea(
      sessionStorage.getItem("specloop-workspace-idea") ??
        restored.input_idea ??
        restored.draft_spec.match(/## Input idea\n([^\n]+)/)?.[1] ??
        restored.interpreted_idea,
    );
    setResource(
      sessionStorage.getItem("specloop-workspace-resource") ??
        restored.compute_budget.target_resource,
    );
    setProjectId(restored.project_id);
    setVersion(restored.version);
    setReadinessScore(restored.readiness_score);
    setCurrentJudges(restored.judges);
    setActiveStage(1);
  }, []);

  async function onAnalyze() {
    if (idea.trim().length < 20) {
      setError(
        "Hãy nhập ý tưởng nghiên cứu ít nhất 20 ký tự trước khi phân tích.",
      );
      return;
    }
    setLoading(true);
    setError("");

    try {
      const data = await analyzeIdea(idea, resource);
      setAnalysis(data);
      setProjectId(data.project_id);
      setRevision("");
      setChangeLog([]);
      setVersion(data.version);
      setReadinessScore(data.readiness_score);
      setCurrentJudges(data.judges);
      setHistory(await getProjectHistory(data.project_id));
      setActiveWorkspace(data);
      sessionStorage.setItem("specloop-workspace", JSON.stringify(data));
      sessionStorage.setItem("specloop-workspace-idea", idea);
      sessionStorage.setItem("specloop-workspace-resource", resource);
      setActiveStage(2);
      router.push("/step/2");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function onRevise() {
    if (!currentDraft) {
      setError("No draft spec to revise.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await reviseSpec(
        projectId,
        currentDraft,
        strategy,
        customNote,
      );
      setRevision(data.revised_spec);
      setChangeLog(data.change_log);
      setVersion(data.version);
      setReadinessScore(data.readiness_score);
      setCurrentJudges(data.judges);
      setHistory(await getProjectHistory(data.project_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function onExport() {
    const file = new Blob([currentDraft], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `specresearch-loop-v${version}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function onAuthenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const users = JSON.parse(
      localStorage.getItem("specloop-users") ?? "[]",
    ) as { name: string; email: string; password: string }[];
    if (authMode === "register") {
      if (
        !authName.trim() ||
        !authEmail.includes("@") ||
        authPassword.length < 6
      ) {
        setAuthError("Nhập tên, email hợp lệ và mật khẩu tối thiểu 6 ký tự.");
        return;
      }
      if (users.some((user) => user.email === authEmail.trim().toLowerCase())) {
        setAuthError("Email này đã được đăng ký.");
        return;
      }
      users.push({
        name: authName.trim(),
        email: authEmail.trim().toLowerCase(),
        password: authPassword,
      });
      localStorage.setItem("specloop-users", JSON.stringify(users));
    }
    const account = users.find(
      (user) =>
        user.email === authEmail.trim().toLowerCase() &&
        user.password === authPassword,
    );
    if (!account) {
      setAuthError("Email hoặc mật khẩu không đúng.");
      return;
    }
    localStorage.setItem(
      "specloop-session",
      JSON.stringify({ name: account.name, email: account.email }),
    );
    setUserName(account.name);
    setAuthOpen(false);
    setAuthPassword("");
  }

  function onLogout() {
    localStorage.removeItem("specloop-session");
    setUserName("");
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#workspace">
          <span className="brand-mark">∞</span> SpecResearch Loop
        </a>
        <nav aria-label="Điều hướng chính">
          <a className="active" href="#workspace">
            ⌂ Trang chủ
          </a>
          <a href="#project">▣ Dự án</a>
          <a href="#history">◴ Lịch sử phiên bản</a>
          <a href="#help">? Trợ giúp</a>
        </nav>
        {userName ? (
          <button
            className="profile-button"
            onClick={onLogout}
            title="Đăng xuất"
          >
            {userName.slice(0, 2).toUpperCase()} <span>{userName}</span>
          </button>
        ) : (
          <button className="login-button" onClick={() => setAuthOpen(true)}>
            Đăng nhập
          </button>
        )}
      </header>
      <main id="workspace" className="workspace">
        <section className="step-heading">
          <div className="step-icon">♧</div>
          <div>
            <h1>1. Nhập ý tưởng &amp; Làm rõ ban đầu</h1>
            <p>
              Hệ thống diễn giải ý tưởng của bạn thành mô tả rõ ràng hơn bằng
              câu hỏi có giải thích và ví dụ.
            </p>
          </div>
        </section>

        <section className="clarification-grid">
          <article className="panel idea-panel">
            <div className="panel-title blue">♧ Nhập ý tưởng</div>
            <textarea
              aria-label="Ý tưởng nghiên cứu"
              rows={6}
              value={idea}
              placeholder="Mô tả vấn đề, mục tiêu, dữ liệu hoặc bối cảnh nghiên cứu của bạn..."
              onChange={(e) => setIdea(e.target.value)}
            />
            <label className="resource-field">
              Tài nguyên dự kiến
              <input
                value={resource}
                onChange={(e) => setResource(e.target.value)}
              />
            </label>
            <button
              className="primary-action"
              onClick={onAnalyze}
              disabled={loading}
            >
              {loading ? "Đang phân tích..." : "⌕ Phân tích ý tưởng"}
            </button>
          </article>

          <article className="panel interpretation-panel">
            <div className="panel-title green">
              ◉ Cách hệ thống đang hiểu ý tưởng
            </div>
            <p>
              {analysis?.interpreted_idea ??
                "Hệ thống sẽ phân tích ý tưởng sau khi bạn gửi, tách nó thành vấn đề, khoảng trống, claim và bằng chứng cần có."}
            </p>
            <div className="issue-box">
              <strong>◎ Vấn đề chính</strong>
              <ul>
                {analysis?.cards
                  .filter(
                    (card) =>
                      card.type === "Problem" ||
                      card.type === "Research question",
                  )
                  .map((card) => <li key={card.type}>{card.content}</li>) ?? (
                  <li>
                    Nhập ý tưởng để hệ thống xác định vấn đề và câu hỏi nghiên
                    cứu.
                  </li>
                )}
              </ul>
            </div>
            <div className="confidence-box">
              ◈ Mức chắc chắn:{" "}
              <strong>{analysis ? "Trung bình" : "Đang chờ phân tích"}</strong>
            </div>
          </article>

          <article className="panel questions-panel">
            <div className="panel-title purple">? Câu hỏi cần xác nhận</div>
            {[
              [
                "goal",
                "Tác vụ chính là gì?",
                [
                  "Trích xuất thông tin",
                  "Trả lời câu hỏi có dẫn nguồn",
                  "Tóm tắt tài liệu",
                  "Other",
                ],
              ],
              [
                "output",
                "Bạn muốn spec cuối cùng để làm gì?",
                ["Làm prototype", "Triển khai thật", "Formal review", "Other"],
              ],
              [
                "data",
                "Khi thiếu thông tin, hệ thống nên?",
                [
                  "Dừng và hỏi lại",
                  "Đưa lựa chọn",
                  "Tạo giả định tạm thời",
                  "Other",
                ],
              ],
            ].map(([key, question, options], index) => (
              <div className="question" key={key as string}>
                <div className="question-number">{index + 1}</div>
                <strong>{question as string}</strong>
                <div className="option-grid">
                  {(options as string[]).map((option) => (
                    <button
                      type="button"
                      className={
                        answers[key as string] === option
                          ? "option selected"
                          : "option"
                      }
                      onClick={() =>
                        setAnswers((current) => ({
                          ...current,
                          [key as string]: option,
                        }))
                      }
                      key={option}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <small>✦ Ví dụ giúp hệ thống hiểu đúng ngữ cảnh.</small>
              </div>
            ))}
          </article>
        </section>

        <section className="flowbar">
          <div className="flow-label">
            ▤ <strong>Tóm tắt sau vòng 1</strong>
          </div>
          <div className="flow-steps">
            <span className="done">● Ý tưởng</span>
            <span className="done">● Làm rõ</span>
            <span className="current">3 Xác nhận</span>
            <span>4 Sang bước tiếp theo</span>
          </div>
          <div className="hint">
            ✦ Gợi ý: Bạn có thể sửa trực tiếp phần hệ thống hiểu nếu thấy chưa
            đúng.
          </div>
        </section>

        <section className="stage-nav" aria-label="Các bước xây dựng spec">
          {[
            [1, "Diễn giải", "/"],
            [2, "Phân rã", "/step/2"],
            [3, "Related work", "/step/3"],
            [4, "Research gap", "/step/4"],
            [5, "Contribution", "/step/5"],
            [6, "Thí nghiệm", "/step/6"],
            [7, "Khả thi", "/step/7"],
            [8, "Research spec", "/step/8"],
            [9, "Judge", "/step/9"],
            [10, "Sửa đổi", "/step/10"],
          ].map(([step, label, href]) => (
            <a
              key={step}
              className={activeStage === step ? "stage active-stage" : "stage"}
              href={href as string}
            >
              <b>{step}</b>
              <span>{label}</span>
            </a>
          ))}
        </section>

        {error ? <p className="error-message">{error}</p> : null}

        {analysis ? (
          <>
            <section id="project" className="card result-card">
              <h2>Interpreted Idea</h2>
              <p>{analysis.interpreted_idea}</p>
              <p className="small">
                Version {version} | Conference readiness: {readinessScore}/100
              </p>
              <p className="small">
                Project ID: {projectId} | Created:{" "}
                {new Date(analysis.created_at).toLocaleString()}
              </p>
            </section>

            <section
              className={
                activeStage === 2 ? "stage-section visible" : "stage-section"
              }
            >
              <h2>2. Nghiên cứu liên quan &amp; tìm Research Gap</h2>
              <CardList cards={analysis.cards} />
            </section>

            <section
              id="history"
              className={
                activeStage === 2
                  ? "card stage-section visible"
                  : "card stage-section"
              }
            >
              <h2>Bảng đối sánh related work</h2>
              <div className="grid" style={{ gap: 12 }}>
                {analysis.related_work.map((paper) => (
                  <article key={paper.title}>
                    <strong>
                      {paper.title} ({paper.year})
                    </strong>
                    <p>{paper.approach}</p>
                    <p className="small">Gap signal: {paper.limitation}</p>
                    <a href={paper.url} target="_blank" rel="noreferrer">
                      Open source
                    </a>
                  </article>
                ))}
              </div>
            </section>

            <section
              className={
                activeStage === 3
                  ? "card stage-section visible"
                  : "card stage-section"
              }
            >
              <h2>3. Xây dựng Contribution &amp; Kế hoạch thí nghiệm</h2>
              <h3>Claim - Evidence Card</h3>
              <div className="grid" style={{ gap: 12 }}>
                {analysis.claim_evidence.map((item) => (
                  <article key={item.claim}>
                    <strong>{item.claim}</strong>
                    <p>
                      <strong>Baseline:</strong> {item.baseline}
                    </p>
                    <p>
                      <strong>Metric:</strong> {item.metric}
                    </p>
                    <p>
                      <strong>Required evidence:</strong> {item.evidence_needed}
                    </p>
                    <p className="small">
                      <strong>Falsification:</strong> {item.falsification}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section
              className={
                activeStage === 3
                  ? "grid two stage-section visible"
                  : "grid two stage-section"
              }
            >
              <article className="card">
                <h2>Experiment Plan</h2>
                {analysis.experiment_plan.map((plan) => (
                  <div key={plan.experiment}>
                    <h3>{plan.experiment}</h3>
                    <p>{plan.purpose}</p>
                    <ul>
                      {plan.setup.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
              <article className="card">
                <h2>Compute Budget</h2>
                <p>
                  <strong>Resource:</strong>{" "}
                  {analysis.compute_budget.target_resource}
                </p>
                <p>
                  <strong>Estimated time:</strong>{" "}
                  {analysis.compute_budget.estimated_hours} hours
                </p>
                <p>
                  <strong>LLM calls:</strong>{" "}
                  {analysis.compute_budget.estimated_llm_calls.toLocaleString()}
                </p>
                <p>
                  <strong>Token budget:</strong>{" "}
                  {analysis.compute_budget.estimated_token_budget.toLocaleString()}
                </p>
                <p className="small">
                  {analysis.compute_budget.recommendation}
                </p>
              </article>
            </section>

            <section
              className={
                activeStage === 4 ? "stage-section visible" : "stage-section"
              }
            >
              <h2>4. Judge độc lập &amp; Xác nhận bản cuối</h2>
              <JudgePanel judges={currentJudges} />
            </section>

            <section
              className={
                activeStage === 5
                  ? "card stage-section visible"
                  : "card stage-section"
              }
            >
              <h2>5. Bản đặc tả nghiên cứu cuối</h2>
              <pre>{currentDraft}</pre>
              <button onClick={onExport} style={{ marginTop: 12 }}>
                Download Markdown
              </button>
            </section>

            <section
              className={
                activeStage === 5
                  ? "card stage-section visible"
                  : "card stage-section"
              }
            >
              <h2>Version History</h2>
              <div className="grid" style={{ gap: 10 }}>
                {history.map((item) => (
                  <article key={item.version}>
                    <strong>Version {item.version}</strong>{" "}
                    <span className="small">
                      Readiness: {item.readiness_score}/100 |{" "}
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                    <ul>
                      {item.change_log.map((change) => (
                        <li key={change}>{change}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>

            <section
              className={
                activeStage === 4
                  ? "card grid stage-section visible"
                  : "card grid stage-section"
              }
              style={{ gap: 10 }}
            >
              <h2>Lựa chọn của người dùng</h2>
              <label>
                Strategy
                <select
                  value={strategy}
                  onChange={(e) =>
                    setStrategy(e.target.value as typeof strategy)
                  }
                >
                  <option value="NARROW_CLAIM">Narrow claim</option>
                  <option value="EXPAND_EXPERIMENT">Expand experiments</option>
                  <option value="TURN_INTO_QUESTION">Turn into question</option>
                  <option value="CUSTOM">Custom note</option>
                </select>
              </label>

              {strategy === "CUSTOM" ? (
                <label>
                  Custom note
                  <textarea
                    rows={3}
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    placeholder="Describe your custom revision"
                  />
                </label>
              ) : null}

              <button onClick={onRevise} disabled={loading}>
                Apply Revision
              </button>

              {changeLog.length > 0 ? (
                <div>
                  <h3>Change log</h3>
                  <ul>
                    {changeLog.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </main>
      {authOpen ? (
        <div className="auth-backdrop" role="presentation">
          <section
            className="auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
          >
            <button
              className="close-auth"
              onClick={() => setAuthOpen(false)}
              aria-label="Đóng"
            >
              ×
            </button>
            <div className="auth-logo">∞</div>
            <h2 id="auth-title">
              {authMode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
            </h2>
            <p>
              {authMode === "login"
                ? "Tiếp tục dự án nghiên cứu của bạn."
                : "Bắt đầu workspace SpecResearch Loop."}
            </p>
            <form onSubmit={onAuthenticate}>
              {authMode === "register" ? (
                <label>
                  Họ và tên
                  <input
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                    autoComplete="name"
                  />
                </label>
              ) : null}
              <label>
                Email
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  autoComplete="email"
                />
              </label>
              <label>
                Mật khẩu
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                />
              </label>
              {authError ? <p className="auth-error">{authError}</p> : null}
              <button type="submit" className="primary-action">
                {authMode === "login" ? "Đăng nhập" : "Đăng ký"}
              </button>
            </form>
            <button
              className="auth-switch"
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setAuthError("");
              }}
            >
              {authMode === "login"
                ? "Chưa có tài khoản? Đăng ký"
                : "Đã có tài khoản? Đăng nhập"}
            </button>
            <small>
              Chế độ local: dữ liệu tài khoản chỉ lưu trong trình duyệt này.
            </small>
          </section>
        </div>
      ) : null}
    </>
  );
}
