"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export type AssessmentRow = Record<string, string | number | null>;

export type AssessmentData = {
  findings: AssessmentRow[];
  evidence: AssessmentRow[];
  reports: AssessmentRow[];
  tasks: AssessmentRow[];
  sessions: AssessmentRow[];
};

type Col = { key: string; label: string; kind?: "date" | "pill" | "mono" };

type TableDef = {
  key: keyof AssessmentData;
  table: string;
  title: string;
  sub: string;
  cols: Col[];
};

const TABLES: TableDef[] = [
  {
    key: "findings",
    table: "security_assessment_findings",
    title: "FINDINGS",
    sub: "ข้อค้นพบจากการประเมิน",
    cols: [
      { key: "id", label: "ID", kind: "mono" },
      { key: "severity", label: "SEVERITY", kind: "pill" },
      { key: "title", label: "TITLE" },
      { key: "category", label: "CATEGORY" },
      { key: "asset_reference", label: "ASSET", kind: "mono" },
      { key: "status", label: "STATUS", kind: "pill" },
      { key: "remediation", label: "REMEDIATION" },
      { key: "discovered_at", label: "DISCOVERED", kind: "date" },
    ],
  },
  {
    key: "evidence",
    table: "security_assessment_evidence",
    title: "EVIDENCE",
    sub: "หลักฐานที่ผูกกับ finding / task",
    cols: [
      { key: "id", label: "ID", kind: "mono" },
      { key: "finding_id", label: "FINDING", kind: "mono" },
      { key: "task_id", label: "TASK", kind: "mono" },
      { key: "evidence_type", label: "TYPE" },
      { key: "storage_reference", label: "STORAGE REF", kind: "mono" },
      { key: "sha256", label: "SHA-256", kind: "mono" },
      { key: "collected_at", label: "COLLECTED", kind: "date" },
    ],
  },
  {
    key: "reports",
    table: "security_assessment_reports",
    title: "REPORTS",
    sub: "รายงานที่สร้างจากการประเมิน",
    cols: [
      { key: "id", label: "ID", kind: "mono" },
      { key: "assessment_id", label: "ASSESSMENT", kind: "mono" },
      { key: "report_format", label: "FORMAT" },
      { key: "status", label: "STATUS", kind: "pill" },
      { key: "summary", label: "SUMMARY" },
      { key: "sha256", label: "SHA-256", kind: "mono" },
      { key: "generated_at", label: "GENERATED", kind: "date" },
    ],
  },
  {
    key: "tasks",
    table: "security_assessment_tasks",
    title: "TASKS",
    sub: "งานย่อยของการประเมิน",
    cols: [
      { key: "id", label: "ID", kind: "mono" },
      { key: "assessment_id", label: "ASSESSMENT", kind: "mono" },
      { key: "task_key", label: "KEY", kind: "mono" },
      { key: "title", label: "TITLE" },
      { key: "status", label: "STATUS", kind: "pill" },
      { key: "result_summary", label: "RESULT" },
      { key: "finished_at", label: "FINISHED", kind: "date" },
    ],
  },
  {
    key: "sessions",
    table: "security_assessment_sessions",
    title: "SESSIONS",
    sub: "เซสชันที่ได้รับอนุญาต (ไม่แสดง session key)",
    cols: [
      { key: "id", label: "ID", kind: "mono" },
      { key: "assessment_id", label: "ASSESSMENT", kind: "mono" },
      { key: "authorization_reference", label: "AUTH REF", kind: "mono" },
      { key: "authorized_by", label: "AUTHORIZED BY", kind: "mono" },
      { key: "status", label: "STATUS", kind: "pill" },
      { key: "valid_from", label: "VALID FROM", kind: "date" },
      { key: "expires_at", label: "EXPIRES", kind: "date" },
    ],
  },
];

function pillClass(value: string): string {
  const v = value.toLowerCase();
  if (["critical", "high", "failed", "revoked", "expired"].includes(v))
    return "op-pill op-pill-bad";
  if (["medium", "open", "pending", "running", "draft"].includes(v))
    return "op-pill op-pill-warn";
  if (
    [
      "low",
      "completed",
      "succeeded",
      "active",
      "ready",
      "approved",
      "fixed",
      "resolved",
    ].includes(v)
  )
    return "op-pill op-pill-ok";
  if (v === "info") return "op-pill op-pill-info";
  return "op-pill op-pill-mute";
}

function fmtDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

const PER_PAGE = 20;

function AssessmentTable({
  def,
  rows,
  loading,
}: {
  def: TableDef;
  rows: AssessmentRow[];
  loading: boolean;
}) {
  const [pg, setPg] = useState(1);
  const count = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const safe = Math.min(pg, count);
  const paged = rows.slice((safe - 1) * PER_PAGE, safe * PER_PAGE);

  return (
    <section className="op-panel">
      <div className="op-head">
        <h2 className="op-title">
          <span className="op-chip">
            <AlertTriangle />
          </span>
          <span>
            {def.title}
            <span className="op-titleSub">
              {def.sub} · {def.table}
            </span>
          </span>
        </h2>
        <span className="op-count">{rows.length} rows</span>
      </div>

      {loading ? (
        <div className="op-empty op-loading">
          <RefreshCw className="op-spin" size={18} />
          LOADING...
        </div>
      ) : rows.length === 0 ? (
        <div className="op-empty">
          <p className="op-emptyTitle">ยังไม่มีข้อมูลใน {def.table}</p>
        </div>
      ) : (
        <div className="op-tableWrap">
          <table className="op-table" style={{ minWidth: 950 }}>
            <thead>
              <tr>
                {def.cols.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, i) => (
                <tr key={String(row.id ?? i)}>
                  {def.cols.map((c) => {
                    const raw = row[c.key];
                    const empty = raw === null || raw === undefined || raw === "";
                    const text = empty ? "—" : String(raw);
                    if (c.kind === "pill" && !empty)
                      return (
                        <td key={c.key}>
                          <span className={pillClass(text)}>
                            {text.toUpperCase()}
                          </span>
                        </td>
                      );
                    if (c.kind === "date")
                      return (
                        <td key={c.key} className="op-faint">
                          {empty ? "—" : fmtDate(text)}
                        </td>
                      );
                    return (
                      <td
                        key={c.key}
                        className={
                          c.kind === "mono"
                            ? "op-mono op-dim op-trunc"
                            : "op-dim op-trunc"
                        }
                        title={empty ? undefined : text}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > PER_PAGE && (
        <div className="op-pager">
          <button
            type="button"
            className="op-btn op-btnXs"
            onClick={() => setPg((c) => Math.max(1, c - 1))}
            disabled={safe <= 1}
          >
            PREV
          </button>
          <span className="op-pageInfo">
            PAGE {safe} / {count} · {rows.length} ROWS
          </span>
          <button
            type="button"
            className="op-btn op-btnXs"
            onClick={() => setPg((c) => Math.min(count, c + 1))}
            disabled={safe >= count}
          >
            NEXT
          </button>
        </div>
      )}
    </section>
  );
}

export function AssessmentTables({
  data,
  loading,
}: {
  data: AssessmentData | null;
  loading: boolean;
}) {
  return (
    <>
      {TABLES.map((def) => (
        <AssessmentTable
          key={def.key}
          def={def}
          rows={data?.[def.key] ?? []}
          loading={loading}
        />
      ))}
    </>
  );
}
