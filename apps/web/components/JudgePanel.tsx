import type { JudgeFeedback } from "@/lib/api";

interface Props {
  judges: JudgeFeedback[];
}

export function JudgePanel({ judges }: Props) {
  return (
    <div className="grid two">
      {judges.map((judge) => (
        <article className="card" key={judge.judge}>
          <h3>{judge.judge}</h3>
          <span className={`tag ${judge.severity === "MAJOR" ? "major" : ""}`}>
            {judge.severity}
          </span>
          <p>
            <strong>Issue:</strong> {judge.issue}
          </p>
          <p>
            <strong>Rationale:</strong> {judge.rationale}
          </p>
          <p>
            <strong>Recommendation:</strong> {judge.recommendation}
          </p>
        </article>
      ))}
    </div>
  );
}
