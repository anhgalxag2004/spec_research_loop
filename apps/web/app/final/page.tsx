"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { RouteHeader } from "@/components/RouteHeader";
import {
  getDecisions,
  getActiveWorkspace,
  getCompiledSpec,
  getProjectHistory,
  getPublication,
  getVersionDiff,
  publishSpec,
  setActiveWorkspace,
  type AnalyzeResponse,
  type CompiledSpecResponse,
  type DecisionRecord,
  type PublicationStatus,
  type VersionDiff,
  type VersionHistoryItem,
} from "@/lib/api";
import {
  canAccessFinalSpec,
  getHighestAccessibleStage,
  getWorkflowPath,
} from "@/lib/workflow";

export default function FinalPage() {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(
    getActiveWorkspace,
  );
  const [workspaceChecked, setWorkspaceChecked] = useState(false);
  const [workflowChecked, setWorkflowChecked] = useState(false);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [history, setHistory] = useState<VersionHistoryItem[]>([]);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [compiledSpec, setCompiledSpec] = useState<CompiledSpecResponse | null>(
    null,
  );
  const [publication, setPublication] = useState<PublicationStatus | null>(
    null,
  );
  const [fromVersion, setFromVersion] = useState<number | null>(null);
  const [toVersion, setToVersion] = useState<number | null>(null);
  const [publicationState, setPublicationState] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const isPublished =
    publication?.workflow_status === "PUBLISHED" &&
    publication.published_version === analysis?.version;

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
    setWorkflowChecked(false);
    void getDecisions(analysis.project_id)
      .then((records) => {
        if (cancelled) return;
        if (!canAccessFinalSpec(records)) {
          router.replace(getWorkflowPath(getHighestAccessibleStage(records)));
          return;
        }
        setDecisions(records);
        setWorkflowChecked(true);
      })
      .catch(() => {
        if (!cancelled) router.replace("/");
      });
    void getCompiledSpec(analysis.project_id)
      .then(setCompiledSpec)
      .catch(() => setCompiledSpec(null));
    void getPublication(analysis.project_id)
      .then(setPublication)
      .catch(() => setPublication(null));
    void getProjectHistory(analysis.project_id)
      .then((versions) => {
        setHistory(versions);
        setToVersion(analysis.version);
        setFromVersion(
          versions.find((item) => item.version < analysis.version)?.version ??
            null,
        );
      })
      .catch(() => setHistory([]));

    return () => {
      cancelled = true;
    };
  }, [analysis?.project_id, analysis?.version, router, workspaceChecked]);

  useEffect(() => {
    if (
      !analysis ||
      fromVersion === null ||
      toVersion === null ||
      fromVersion === toVersion
    ) {
      setDiff(null);
      return;
    }
    void getVersionDiff(analysis.project_id, fromVersion, toVersion)
      .then(setDiff)
      .catch(() => setDiff(null));
  }, [analysis?.project_id, fromVersion, toVersion]);

  async function publishFinalSpec() {
    if (!analysis) return;
    setPublicationState("saving");
    try {
      const nextPublication = await publishSpec(analysis.project_id);
      setPublication(nextPublication);
      const [records, nextSpec] = await Promise.all([
        getDecisions(analysis.project_id),
        getCompiledSpec(analysis.project_id),
      ]);
      setDecisions(records);
      setCompiledSpec(nextSpec);
      setPublicationState("idle");
    } catch {
      setPublicationState("error");
    }
  }

  function downloadMarkdown() {
    if (!analysis) return;
    const content =
      isPublished && publication?.content
        ? publication.content
        : (compiledSpec?.content ?? analysis.draft_spec);
    const file = new Blob([content], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = isPublished
      ? `research-spec-published-v${publication.published_version}.md`
      : `research-spec-preview-v${analysis.version}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!workspaceChecked || !workflowChecked)
    return <main className="workspace-pending" aria-busy="true" />;

  if (!analysis) return <main className="workspace-pending" aria-busy="true" />;

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
              <b>{number === "11" ? "✓" : number}</b>
              {label}
            </Link>
          ))}
        </nav>
        <div className="final-layout">
          <section className="card final-checklist">
            <h1>▤ Bản đặc tả nghiên cứu cuối</h1>
            <p className="small">
              Mỗi mục phản ánh nguồn, evidence và decision đang được lưu cho
              phiên bản hiện tại.
            </p>
            <ol>
              {(compiledSpec?.sections ?? []).map((section) => (
                <li key={section.key}>
                  <span className={section.status.toLowerCase()}>
                    {section.status === "READY" ? "✓" : "!"}
                  </span>
                  <div>
                    <strong>{section.title}</strong>
                    <small>{section.detail}</small>
                  </div>
                </li>
              ))}
            </ol>
            {compiledSpec?.blockers.length ? (
              <div className="publication-warning">
                <strong>Các mục còn mở</strong>
                <ul>
                  {compiledSpec.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="final-focus">◎ {analysis.interpreted_idea}</div>
          </section>
          <section className="final-right">
            <article className="card llm-summary">
              <h2>✦ Tóm tắt workspace</h2>
              <ol>
                <li>{analysis.input_idea}</li>
                <li>
                  {compiledSpec
                    ? `${compiledSpec.sections.filter((section) => section.status === "READY").length}/${compiledSpec.sections.length} section đang đủ thông tin.`
                    : "Đang tải trạng thái section."}
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
                <ul className="decision-list">
                  {decisions.length ? (
                    decisions.map((decision) => (
                      <li
                        key={`${decision.created_at}-${decision.decision_type}`}
                      >
                        <strong>{decision.decision_type}:</strong>{" "}
                        {decision.value}
                      </li>
                    ))
                  ) : (
                    <li>Chưa có quyết định được lưu.</li>
                  )}
                </ul>
              </div>
            </article>
            {compiledSpec ? (
              <article className="card draft-spec">
                <h2>Research spec v{compiledSpec.version}</h2>
                <pre>{compiledSpec.content}</pre>
              </article>
            ) : null}
            <article className="card version-history">
              <div className="history-title">
                <div>
                  <h2>Lịch sử phiên bản</h2>
                  <p className="small">
                    Chọn hai phiên bản bất kỳ để xem diff từ server.
                  </p>
                </div>
                <span>{history.length} version</span>
              </div>
              <ol className="version-timeline">
                {history.map((item) => (
                  <li
                    className={
                      item.version === analysis.version ? "current-version" : ""
                    }
                    key={item.version}
                  >
                    <strong>v{item.version}</strong>
                    <span>{item.readiness_score}/100 readiness</span>
                    <time>{new Date(item.created_at).toLocaleString()}</time>
                    <small>{item.change_log.join(" ")}</small>
                  </li>
                ))}
              </ol>
              {history.length > 1 ? (
                <div className="diff-controls">
                  <label>
                    Từ version
                    <select
                      value={fromVersion ?? ""}
                      onChange={(event) =>
                        setFromVersion(
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                    >
                      {history
                        .filter((item) => item.version !== toVersion)
                        .map((item) => (
                          <option key={item.version} value={item.version}>
                            v{item.version}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Đến version
                    <select
                      value={toVersion ?? ""}
                      onChange={(event) =>
                        setToVersion(
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                    >
                      {history
                        .filter((item) => item.version !== fromVersion)
                        .map((item) => (
                          <option key={item.version} value={item.version}>
                            v{item.version}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              ) : null}
              {diff ? (
                <div className="version-diff">
                  <h3>
                    Diff v{diff.from_version} → v{diff.to_version}
                  </h3>
                  <pre>
                    {diff.diff_lines.join("\n") ||
                      "Không có thay đổi nội dung."}
                  </pre>
                </div>
              ) : history.length > 1 ? (
                <p className="small">Chọn hai version khác nhau để so sánh.</p>
              ) : null}
            </article>
            <article className="card publication-card">
              <h2>
                {isPublished ? "✓ Spec đã xuất bản" : "Xuất bản spec cuối"}
              </h2>
              {isPublished ? (
                <p className="publication-status">
                  Đã xuất bản version v{publication.published_version} lúc{" "}
                  {publication.published_at
                    ? new Date(publication.published_at).toLocaleString()
                    : "không rõ thời điểm"}
                  . Snapshot này không bị thay đổi bởi thao tác sau đó.
                </p>
              ) : (
                <p className="small">
                  Publish sẽ chụp immutable snapshot của canonical spec hiện tại
                  và lưu version/timestamp ở server.
                </p>
              )}
              {compiledSpec?.blockers.length ? (
                <p className="publication-blocker">
                  Còn {compiledSpec.blockers.length} blocker. Hoàn tất các mục
                  còn mở trước khi xuất bản.
                </p>
              ) : null}
              <div className="final-actions">
                <button
                  className={isPublished ? "confirmed" : ""}
                  disabled={
                    publicationState === "saving" ||
                    isPublished ||
                    !compiledSpec ||
                    compiledSpec.blockers.length > 0
                  }
                  onClick={() => void publishFinalSpec()}
                >
                  {isPublished
                    ? "✓ Đã xuất bản"
                    : publicationState === "saving"
                      ? "Đang xuất bản..."
                      : "Xuất bản spec"}
                </button>
                <Link href="/step/10">✎ Chỉnh sửa thêm</Link>
                <button onClick={downloadMarkdown}>
                  ▣{" "}
                  {isPublished ? "Tải snapshot xuất bản" : "Tải bản xem trước"}
                </button>
              </div>
              {publicationState === "error" ? (
                <p className="form-error">Không thể xuất bản spec cuối.</p>
              ) : null}
            </article>
          </section>
        </div>
        <footer
          className={isPublished ? "final-banner confirmed" : "final-banner"}
        >
          ✓{" "}
          {isPublished
            ? `Spec v${publication?.published_version} đã được xuất bản và sẵn sàng cho triển khai hoặc viết proposal.`
            : "Hoàn tất các blocker trước khi xuất bản research specification."}
        </footer>
      </main>
    </>
  );
}
