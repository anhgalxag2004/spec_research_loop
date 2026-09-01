import json
import os
import sqlite3
from difflib import unified_diff
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

DATA_DIR = Path(os.getenv("SPECLOOP_DATA_DIR", "/tmp/specloop"))
DATABASE_PATH = DATA_DIR / "specloop.db"


def _connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    with _connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                idea TEXT NOT NULL,
                target_resource TEXT NOT NULL DEFAULT 'RTX 3090',
                created_at TEXT NOT NULL,
                current_version INTEGER NOT NULL,
                current_step INTEGER NOT NULL DEFAULT 1,
                workflow_status TEXT NOT NULL DEFAULT 'ACTIVE',
                published_version INTEGER,
                published_at TEXT
            );
            CREATE TABLE IF NOT EXISTS spec_versions (
                project_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                draft_spec TEXT NOT NULL,
                change_log TEXT NOT NULL,
                readiness_score INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (project_id, version),
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE TABLE IF NOT EXISTS decisions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                spec_version INTEGER NOT NULL,
                decision_type TEXT NOT NULL,
                value TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE TABLE IF NOT EXISTS judge_runs (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                spec_version_used INTEGER NOT NULL,
                judge TEXT NOT NULL,
                severity TEXT NOT NULL,
                status TEXT NOT NULL,
                result TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE TABLE IF NOT EXISTS evidence_records (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                spec_version INTEGER NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                claim TEXT NOT NULL,
                passage TEXT NOT NULL,
                verdict TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE TABLE IF NOT EXISTS related_work_records (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                spec_version INTEGER NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                year INTEGER,
                approach TEXT NOT NULL,
                limitation TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE TABLE IF NOT EXISTS publications (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                spec_version INTEGER NOT NULL,
                content TEXT NOT NULL,
                published_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            """
        )
        existing_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(projects)").fetchall()
        }
        if "current_step" not in existing_columns:
            connection.execute("ALTER TABLE projects ADD COLUMN current_step INTEGER NOT NULL DEFAULT 1")
        if "workflow_status" not in existing_columns:
            connection.execute("ALTER TABLE projects ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'ACTIVE'")
        if "target_resource" not in existing_columns:
            connection.execute("ALTER TABLE projects ADD COLUMN target_resource TEXT NOT NULL DEFAULT 'RTX 3090'")
        if "published_version" not in existing_columns:
            connection.execute("ALTER TABLE projects ADD COLUMN published_version INTEGER")
        if "published_at" not in existing_columns:
            connection.execute("ALTER TABLE projects ADD COLUMN published_at TEXT")


def create_project(idea: str, draft_spec: str, readiness_score: int, target_resource: str) -> tuple[str, str]:
    project_id = uuid4().hex[:12]
    created_at = datetime.now(UTC).isoformat()
    with _connection() as connection:
        connection.execute(
            "INSERT INTO projects (id, idea, target_resource, created_at, current_version) VALUES (?, ?, ?, ?, ?)",
            (project_id, idea, target_resource, created_at, 1),
        )
        connection.execute(
            """INSERT INTO spec_versions
            (project_id, version, draft_spec, change_log, readiness_score, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (project_id, 1, draft_spec, json.dumps(["Initial specification created."]), readiness_score, created_at),
        )
    return project_id, created_at


def save_revision(project_id: str, draft_spec: str, change_log: list[str], readiness_score: int) -> int:
    created_at = datetime.now(UTC).isoformat()
    with _connection() as connection:
        project = connection.execute("SELECT current_version FROM projects WHERE id = ?", (project_id,)).fetchone()
        if project is None:
            raise ValueError("Project does not exist.")
        version = project["current_version"] + 1
        connection.execute(
            """INSERT INTO spec_versions
            (project_id, version, draft_spec, change_log, readiness_score, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (project_id, version, draft_spec, json.dumps(change_log), readiness_score, created_at),
        )
        connection.execute(
            """UPDATE projects
            SET current_version = ?, workflow_status = 'ACTIVE',
                published_version = NULL, published_at = NULL
            WHERE id = ?""",
            (version, project_id),
        )
    return version


def get_latest_spec(project_id: str) -> dict[str, object]:
    with _connection() as connection:
        row = connection.execute(
            """SELECT spec_versions.version, draft_spec, projects.idea, projects.target_resource
            FROM spec_versions JOIN projects ON projects.id = spec_versions.project_id
            WHERE project_id = ? AND version = projects.current_version""",
            (project_id,),
        ).fetchone()
    if row is None:
        raise ValueError("Project does not exist.")
    return {
        "version": row["version"],
        "draft_spec": row["draft_spec"],
        "idea": row["idea"],
        "target_resource": row["target_resource"],
    }


def save_decision(project_id: str, spec_version: int, decision_type: str, value: str) -> None:
    with _connection() as connection:
        connection.execute(
            """INSERT INTO decisions (id, project_id, spec_version, decision_type, value, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (uuid4().hex, project_id, spec_version, decision_type, value, datetime.now(UTC).isoformat()),
        )
        if decision_type != "FINAL_PUBLICATION":
            connection.execute(
                """UPDATE projects
                SET workflow_status = 'ACTIVE', published_version = NULL, published_at = NULL
                WHERE id = ?""",
                (project_id,),
            )


def get_decisions(project_id: str) -> list[dict[str, object]]:
    with _connection() as connection:
        rows = connection.execute(
            """SELECT spec_version, decision_type, value, created_at FROM decisions
            WHERE project_id = ? ORDER BY created_at DESC""",
            (project_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def save_evidence(project_id: str, spec_version: int, evidence: dict[str, str]) -> dict[str, object]:
    evidence_id = uuid4().hex
    created_at = datetime.now(UTC).isoformat()
    with _connection() as connection:
        project = connection.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone()
        if project is None:
            raise ValueError("Project does not exist.")
        connection.execute(
            """INSERT INTO evidence_records
            (id, project_id, spec_version, title, url, claim, passage, verdict, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                evidence_id,
                project_id,
                spec_version,
                evidence["title"],
                evidence["url"],
                evidence["claim"],
                evidence["passage"],
                evidence["verdict"],
                created_at,
            ),
        )
        connection.execute(
            """UPDATE projects
            SET workflow_status = 'ACTIVE', published_version = NULL, published_at = NULL
            WHERE id = ?""",
            (project_id,),
        )
    return {"id": evidence_id, "spec_version": spec_version, "created_at": created_at, **evidence}


def get_evidence(project_id: str) -> list[dict[str, object]]:
    with _connection() as connection:
        rows = connection.execute(
            """SELECT id, spec_version, title, url, claim, passage, verdict, created_at
            FROM evidence_records WHERE project_id = ? ORDER BY created_at DESC""",
            (project_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def save_related_work(project_id: str, spec_version: int, item: dict[str, object]) -> dict[str, object]:
    item_id = uuid4().hex
    created_at = datetime.now(UTC).isoformat()
    with _connection() as connection:
        project = connection.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone()
        if project is None:
            raise ValueError("Project does not exist.")
        connection.execute(
            """INSERT INTO related_work_records
            (id, project_id, spec_version, title, url, year, approach, limitation, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (item_id, project_id, spec_version, item["title"], item["url"], item.get("year"), item["approach"], item["limitation"], created_at),
        )
        connection.execute(
            """UPDATE projects
            SET workflow_status = 'ACTIVE', published_version = NULL, published_at = NULL
            WHERE id = ?""",
            (project_id,),
        )
    return {"id": item_id, "spec_version": spec_version, "created_at": created_at, **item}


def get_related_work(project_id: str) -> list[dict[str, object]]:
    with _connection() as connection:
        rows = connection.execute(
            """SELECT id, spec_version, title, url, year, approach, limitation, created_at
            FROM related_work_records WHERE project_id = ? ORDER BY created_at DESC""",
            (project_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_publication(project_id: str) -> dict[str, object]:
    with _connection() as connection:
        row = connection.execute(
            """SELECT projects.id AS project_id, projects.workflow_status,
            projects.current_version, projects.published_version, projects.published_at,
            publications.content
            FROM projects
            LEFT JOIN publications ON publications.project_id = projects.id
                AND publications.published_at = projects.published_at
            WHERE projects.id = ?""",
            (project_id,),
        ).fetchone()
    if row is None:
        raise ValueError("Project does not exist.")
    return dict(row)


def publish_project(project_id: str, spec_version: int, content: str) -> dict[str, object]:
    with _connection() as connection:
        project = connection.execute(
            """SELECT current_version, workflow_status, published_version, published_at
            FROM projects WHERE id = ?""",
            (project_id,),
        ).fetchone()
        if project is None:
            raise ValueError("Project does not exist.")
        if int(project["current_version"]) != spec_version:
            raise ValueError("The latest specification changed before publication.")

        if (
            project["workflow_status"] == "PUBLISHED"
            and project["published_version"] == spec_version
            and project["published_at"]
        ):
            published = connection.execute(
                """SELECT content FROM publications
                WHERE project_id = ? AND published_at = ?""",
                (project_id, project["published_at"]),
            ).fetchone()
            return {
                "project_id": project_id,
                "workflow_status": "PUBLISHED",
                "current_version": project["current_version"],
                "published_version": project["published_version"],
                "published_at": project["published_at"],
                "content": published["content"] if published else content,
            }

        published_at = datetime.now(UTC).isoformat()
        connection.execute(
            """INSERT INTO publications
            (id, project_id, spec_version, content, published_at)
            VALUES (?, ?, ?, ?, ?)""",
            (uuid4().hex, project_id, spec_version, content, published_at),
        )
        connection.execute(
            """UPDATE projects
            SET workflow_status = 'PUBLISHED', published_version = ?, published_at = ?
            WHERE id = ?""",
            (spec_version, published_at, project_id),
        )
    return {
        "project_id": project_id,
        "workflow_status": "PUBLISHED",
        "current_version": spec_version,
        "published_version": spec_version,
        "published_at": published_at,
        "content": content,
    }


def get_judge_consensus(project_id: str) -> dict[str, object]:
    latest = get_latest_spec(project_id)
    version = int(latest["version"])
    with _connection() as connection:
        rows = connection.execute(
            """SELECT result FROM judge_runs
            WHERE project_id = ? AND spec_version_used = ? AND status = 'COMPLETED'
            ORDER BY created_at DESC""",
            (project_id, version),
        ).fetchall()
    latest_per_judge: dict[str, dict[str, object]] = {}
    for row in rows:
        result = json.loads(row["result"])
        latest_per_judge.setdefault(str(result["judge"]), result)
    judges = list(latest_per_judge.values())
    major_count = sum(judge["severity"] == "MAJOR" for judge in judges)
    judge_count = len(judges)
    minor_count = judge_count - major_count
    agreement_score = round(max(major_count, minor_count) / judge_count * 100) if judge_count else 0
    role_findings = [str(judge["issue"]) for judge in judges]
    agreed_findings: list[str] = []
    if major_count:
        agreed_findings.append(f"{major_count}/{judge_count} Judge(s) classify at least one blocking issue as MAJOR.")
    if minor_count:
        agreed_findings.append(f"{minor_count}/{judge_count} Judge(s) report a MINOR issue or refinement.")
    disagreements = (
        [f"Severity is split: {major_count} MAJOR and {minor_count} MINOR assessments."]
        if major_count and minor_count
        else []
    )
    return {
        "project_id": project_id,
        "spec_version_used": version,
        "judge_count": judge_count,
        "major_count": major_count,
        "minor_count": minor_count,
        "agreement_score": agreement_score,
        "consensus": "Revision is required before final publication." if major_count else "No major issue was found by the latest Judge run.",
        "agreed_findings": agreed_findings,
        "disagreements": disagreements,
        "role_findings": role_findings,
    }


def get_version_diff(project_id: str, from_version: int, to_version: int) -> dict[str, object]:
    with _connection() as connection:
        rows = connection.execute(
            """SELECT version, draft_spec FROM spec_versions
            WHERE project_id = ? AND version IN (?, ?)""",
            (project_id, from_version, to_version),
        ).fetchall()
    specs = {row["version"]: row["draft_spec"] for row in rows}
    if from_version not in specs or to_version not in specs:
        raise ValueError("One or both specification versions do not exist.")
    return {
        "project_id": project_id,
        "from_version": from_version,
        "to_version": to_version,
        "diff_lines": list(
            unified_diff(
                specs[from_version].splitlines(),
                specs[to_version].splitlines(),
                fromfile=f"spec-v{from_version}",
                tofile=f"spec-v{to_version}",
                lineterm="",
            )
        ),
    }


def save_judge_runs(project_id: str, spec_version: int, judges: list[dict[str, object]]) -> list[dict[str, object]]:
    created_at = datetime.now(UTC).isoformat()
    with _connection() as connection:
        connection.execute(
            "UPDATE judge_runs SET status = 'STALE' WHERE project_id = ? AND spec_version_used < ? AND status = 'COMPLETED'",
            (project_id, spec_version),
        )
        for judge in judges:
            connection.execute(
                """INSERT INTO judge_runs (id, project_id, spec_version_used, judge, severity, status, result, created_at)
                VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?)""",
                (uuid4().hex, project_id, spec_version, judge["judge"], judge["severity"], json.dumps(judge), created_at),
            )
    return [
        {
            "judge": judge["judge"],
            "spec_version_used": spec_version,
            "status": "COMPLETED",
            "severity": judge["severity"],
        }
        for judge in judges
    ]


def update_workflow_checkpoint(project_id: str, current_step: int) -> None:
    with _connection() as connection:
        connection.execute(
            "UPDATE projects SET current_step = ? WHERE id = ?",
            (current_step, project_id),
        )


def get_project_history(project_id: str) -> list[dict[str, object]]:
    with _connection() as connection:
        rows = connection.execute(
            """SELECT version, change_log, readiness_score, created_at
            FROM spec_versions WHERE project_id = ? ORDER BY version DESC""",
            (project_id,),
        ).fetchall()
    return [
        {
            "version": row["version"],
            "change_log": json.loads(row["change_log"]),
            "readiness_score": row["readiness_score"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
