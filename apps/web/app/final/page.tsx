"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { RouteHeader } from "@/components/RouteHeader";
import {
  getDecisions,
  getActiveWorkspace,
  getVersionDiff,
  saveDecision,
  setActiveWorkspace,
  type AnalyzeResponse,
  type DecisionRecord,
  type VersionDiff,
} from "@/lib/api";

const FINAL_ITEMS = [
  "Problem statement",
  "Research question",
  "Related-work matrix",
  "Research gap",
  "Contributions",
  "Claim - evidence matrix",
  "Experimental protocol",
  "Compute budget",
  "Risks & limitations",
  "Decision log",
];

export default function FinalPage() {
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(
    getActiveWorkspace,
  );
  const [workspaceChecked, setWorkspaceChecked] = useState(
    Boolean(getActiveWorkspace()),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [diff, setDiff] = useState<VersionDiff | null>(null);

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
    void getDecisions(analysis.project_id)
      .then(setDecisions)
      .catch(() => undefined);
    if (analysis.version > 1) {
      void getVersionDiff(
        analysis.project_id,
        analysis.version - 1,
        analysis.version,
      )
        .then(setDiff)
        .catch(() => undefined);
    }
  }, [analysis?.project_id, analysis?.version]);

  async function confirmSpec() {
    if (!analysis) return;
    await saveDecision(
      analysis.project_id,
      "FINAL_PUBLICATION",
      "User confirmed the final research specification.",
    );
    setConfirmed(true);
    setDecisions(await getDecisions(analysis.project_id));
  }

  function downloadMarkdown() {
    if (!analysis) return;
    const file = new Blob([analysis.draft_spec], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "research-spec-final.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!workspaceChecked)
    return <main className="workspace-pending" aria-busy="true" />;

  if (!analysis)
    return (
      <main className="empty-workspace">
        <h1>Chưa có bản đặc tả</h1>
        <p>Hoàn thành bước nhập ý tưởng để tạo bản đặc tả nghiên cứu.</p>
        <a href="/">Quay lại bước 1</a>
      </main>
    );

  return (
    <>
      <RouteHeader />
      <main className="final-page">
        <nav className="route-wizard" aria-label="Tiến trình dự án">
          {[
            ["1", "Ý tưởng", "/"],
            ["8", "Research spec", "/step/8"],
            ["9", "Judge", "/step/9"],
            ["10", "Sửa đổi", "/step/10"],
            ["11", "Spec cuối", "/final"],
          ].map(([number, label, href]) => (
            <Link
              className={number === "11" ? "route-step active" : "route-step"}
              href={href}
              key={number}
            >
              <b>{number === "11" ? "✓" : "✓"}</b>
              {label}
            </Link>
          ))}
        </nav>
        <div className="final-layout">
          <section className="card final-checklist">
            <h1>▤ Bản đặc tả nghiên cứu cuối</h1>
            <ol>
              {FINAL_ITEMS.map((item) => (
                <li key={item}>
                  <span>✓</span>
                  {item}
                </li>
              ))}
            </ol>
            <div className="final-focus">◎ {analysis.interpreted_idea}</div>
          </section>
          <section className="final-right">
            <article className="card llm-summary">
              <h2>✦ Tóm tắt workspace</h2>
              <ol>
                <li>{analysis.input_idea}</li>
                <li>
                  {analysis.claim_evidence.length} claim-evidence record trong
                  bản spec.
                </li>
                <li>
                  {analysis.experiment_plan.length} kế hoạch thí nghiệm được
                  định nghĩa.
                </li>
                <li>Spec version hiện tại: v{analysis.version}.</li>
              </ol>
            </article>
            <article className="card example-box">
              <h2>▣ Decision log</h2>
              <div>
                <b>{decisions.length}</b>
                <p>
                  {decisions.length
                    ? decisions
                        .map(
                          (decision) =>
                            `${decision.decision_type}: ${decision.value}`,
                        )
                        .join(" | ")
                    : "Chưa có quyết định được lưu."}
                </p>
              </div>
            </article>
            {diff ? (
              <article className="card draft-spec">
                <h2>
                  Diff v{diff.from_version} → v{diff.to_version}
                </h2>
                <pre>
                  {diff.diff_lines.join("\n") || "Không có thay đổi nội dung."}
                </pre>
              </article>
            ) : null}
            <article className="card confirm-box">
              <h2>✓ Xác nhận cuối cùng</h2>
              <div className="final-actions">
                <button
                  className={confirmed ? "confirmed" : ""}
                  onClick={() => void confirmSpec()}
                >
                  {confirmed ? "✓ Spec đã xác nhận" : "✓ Xác nhận spec"}
                </button>
                <Link href="/step/10">✎ Chỉnh sửa thêm</Link>
                <button onClick={downloadMarkdown}>▣ Xuất Markdown</button>
              </div>
            </article>
          </section>
        </div>
        <footer
          className={confirmed ? "final-banner confirmed" : "final-banner"}
        >
          ✓{" "}
          {confirmed
            ? "Spec đã sẵn sàng cho bước triển khai hoặc viết proposal."
            : "Hoàn tất xác nhận để chốt research specification."}
        </footer>
      </main>
    </>
  );
}
