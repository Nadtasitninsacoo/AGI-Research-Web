"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Eye,
  Layers3,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";

import { Navbar } from "@/components/hud/Navbar";
import { Sidebar } from "@/components/hud/Sidebar";
import "@/styles/ops.css";

type Batch = {
  id: number;
  plan_id: number;
  batch_number: number;
  status: string;
  total_items: number;
  succeeded_items: number;
  failed_items: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type BatchItem = {
  id: number;
  plan_target_id: number;
  ip: string;
  port: number | null;
  country: string | null;
  status: string;
  result_summary: string | null;
  success_reason: string | null;
  created_at: string;
  completed_at: string | null;
};

type BatchDetail = Batch & { items: BatchItem[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (isRecord(value) && Array.isArray(value.data)) {
    return value.data as T[];
  }
  if (isRecord(value) && Array.isArray(value.items)) {
    return value.items as T[];
  }
  return [];
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusTone(status: string): string {
  switch (status.toUpperCase()) {
    case "COMPLETED":
    case "SUCCEEDED":
      return "op-pill-ok";
    case "FAILED":
      return "op-pill-bad";
    case "PROCESSING":
    case "RUNNING":
      return "op-pill-info";
    case "CANCELLED":
      return "op-pill-mute";
    default:
      return "op-pill-warn";
  }
}

export default function RunBatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [itemPage, setItemPage] = useState(1);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/run-batches", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? "ไม่มีสิทธิ์เข้าถึง Run Batches กรุณาตรวจสอบ API Token"
            : `โหลด Batch ไม่สำเร็จ (${response.status})`,
        );
      }

      const result: unknown = await response.json();
      const rows = unwrapArray<Batch>(result);
      setBatches(rows);

      if (selected) {
        const current = rows.find((batch) => batch.id === selected.id);
        if (current) {
          await loadDetail(current.id);
        } else {
          setSelected(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    setError("");
    setItemPage(1);

    try {
      const response = await fetch(`/api/run-batches/${id}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`โหลดรายละเอียด Batch ไม่สำเร็จ (${response.status})`);
      }

      const result: unknown = await response.json();
      if (!isRecord(result)) {
        throw new Error("รูปแบบข้อมูล Batch ไม่ถูกต้อง");
      }

      const items = Array.isArray(result.items)
        ? (result.items as BatchItem[])
        : [];

      setSelected({ ...(result as unknown as Batch), items });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  // Close the detail modal with Escape, and lock body scroll while open.
  useEffect(() => {
    if (!selected) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selected]);

  const total = batches.reduce((sum, batch) => sum + batch.total_items, 0);
  const succeeded = batches.reduce(
    (sum, batch) => sum + batch.succeeded_items,
    0,
  );
  const failed = batches.reduce(
    (sum, batch) => sum + batch.failed_items,
    0,
  );

  const PER_PAGE = 20;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(batches.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pagedBatches = batches.slice(
    (safePage - 1) * PER_PAGE,
    safePage * PER_PAGE,
  );

  const ITEMS_PER_PAGE = 20;
  const itemCount = selected?.items.length ?? 0;
  const itemPageCount = Math.max(1, Math.ceil(itemCount / ITEMS_PER_PAGE));
  const safeItemPage = Math.min(itemPage, itemPageCount);
  const pagedItems = selected
    ? selected.items.slice(
        (safeItemPage - 1) * ITEMS_PER_PAGE,
        safeItemPage * ITEMS_PER_PAGE,
      )
    : [];

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const stats = [
    { label: "TOTAL BATCHES", value: batches.length, icon: Layers3, tone: "op-cyan", bar: batches.length > 0 ? 100 : 0 },
    { label: "TOTAL ITEMS", value: total, icon: Activity, tone: "op-blue", bar: total > 0 ? 100 : 0 },
    { label: "SUCCEEDED", value: succeeded, icon: CheckCircle2, tone: "op-ok", bar: pct(succeeded) },
    { label: "FAILED", value: failed, icon: XCircle, tone: "op-red", bar: pct(failed) },
  ];

  return (
    <div className="shell" style={{ background: "#090a0f" }}>
      <Sidebar online={!error} />

      <div className="main flex min-w-0 flex-col">
        <Navbar online={!error} title="RUN BATCHES" link="API" />

        <main className="op-page">
          <header className="op-hero">
            <div>
              <div className="op-kicker">
                <Activity size={13} />
                AGI RESEARCH / OPERATIONS
              </div>
              <h1 className="op-h1">
                Run Batch <b>Control</b>
              </h1>
              <p className="op-sub">
                ติดตาม Batch และตรวจสอบรายการ Metadata ที่อยู่ในคิว
              </p>
            </div>

            <div className="op-actions">
              <button
                type="button"
                onClick={() => void loadBatches()}
                disabled={loading}
                className="op-btn"
              >
                <RefreshCw className={loading ? "op-spin" : ""} />
                REFRESH
              </button>
            </div>
          </header>

          {error && (
            <div role="alert" className="op-alert">
              <XCircle />
              {error}
            </div>
          )}

          <section className="op-stats">
            {stats.map((stat) => {
              const IconComponent = stat.icon;
              return (
                <article key={stat.label} className={`op-stat ${stat.tone}`}>
                  <div className="op-statHead">
                    {stat.label}
                    <span className="op-statIcon">
                      <IconComponent />
                    </span>
                  </div>
                  <div className="op-statValue">{stat.value}</div>
                  <div className="op-bar" aria-hidden>
                    <i style={{ width: `${stat.bar}%` }} />
                  </div>
                </article>
              );
            })}
          </section>

          <section className="op-panel">
            <div className="op-head">
              <h2 className="op-title">
                <span className="op-chip">
                  <Layers3 />
                </span>
                BATCH HISTORY
              </h2>
              <span className="op-count">{batches.length} RECORDS</span>
            </div>

            {loading ? (
              <div className="op-empty op-loading">
                <RefreshCw className="op-spin" size={18} />
                LOADING BATCHES...
              </div>
            ) : batches.length === 0 ? (
              <div className="op-empty">
                <span className="op-emptyIcon">
                  <Layers3 />
                </span>
                <p className="op-emptyTitle">ยังไม่มี Batch ในระบบ</p>
                <p className="op-emptySub">
                  Batch จะปรากฏที่นี่เมื่อมีการสร้างคิวจาก Team Task Plan
                </p>
              </div>
            ) : (
              <div className="op-tableWrap">
                <table className="op-table">
                  <thead>
                    <tr>
                      <th>BATCH</th>
                      <th>PLAN ID</th>
                      <th>STATUS</th>
                      <th>ITEMS</th>
                      <th>SUCCEEDED</th>
                      <th>CREATED</th>
                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {pagedBatches.map((batch) => (
                      <tr
                        key={batch.id}
                        className={selected?.id === batch.id ? "is-selected" : ""}
                      >
                        <td>
                          <span className="op-strong">#{batch.batch_number}</span>
                          <div className="op-faint">ID {batch.id}</div>
                        </td>
                        <td className="op-mono op-dim">#{batch.plan_id}</td>
                        <td>
                          <span className={`op-pill ${statusTone(batch.status)}`}>
                            {batch.status}
                          </span>
                        </td>
                        <td className="op-mono op-strong">{batch.total_items}</td>
                        <td className="op-mono op-okText">{batch.succeeded_items}</td>
                        <td className="op-dim">{dateLabel(batch.created_at)}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => void loadDetail(batch.id)}
                            className="op-btn op-btnXs"
                          >
                            <Eye />
                            VIEW
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {batches.length > PER_PAGE && (
              <div className="op-pager">
                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  PREV
                </button>
                <span className="op-pageInfo">
                  PAGE {safePage} / {pageCount} · {batches.length} BATCHES
                </span>
                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={safePage >= pageCount}
                >
                  NEXT
                </button>
              </div>
            )}
          </section>

          <footer className="op-foot">
            <span>
              <Clock3 />
              Batch records are read from stored metadata. No network operation
              is performed by this page.
            </span>
          </footer>
        </main>
      </div>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Batch #${selected.batch_number} details`}
          onClick={() => setSelected(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(3,5,10,0.78)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(1240px, 95vw)",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              background: "#0c0e15",
              border: "1px solid rgba(45,226,230,0.35)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span className="op-chip">
                <Eye />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  BATCH #{selected.batch_number} / ITEMS
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--dim, #8a8f99)",
                    fontFamily: "var(--font-mono), monospace",
                  }}
                >
                  Batch ID {selected.id} · Plan #{selected.plan_id} ·{" "}
                  {selected.items.length} รายการ · สร้าง{" "}
                  {dateLabel(selected.created_at)}
                </div>
              </div>

              {detailLoading && <RefreshCw size={15} className="op-spin" />}

              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="ปิด"
                className="op-btn op-btnXs"
              >
                <X />
                ปิด
              </button>
            </div>

            {/* Batch summary chips */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                padding: "12px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span className={`op-pill ${statusTone(selected.status)}`}>
                {selected.status}
              </span>
              <ModalStat label="ITEMS" value={selected.total_items} />
              <ModalStat label="SUCCEEDED" value={selected.succeeded_items} />
              <ModalStat label="FAILED" value={selected.failed_items} />
            </div>

            {/* Scrollable items table */}
            <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
              {selected.items.length === 0 ? (
                <div className="op-empty">
                  <p className="op-emptySub">Batch นี้ยังไม่มีรายการ</p>
                </div>
              ) : (
                <table className="op-table">
                  <thead>
                    <tr>
                      <th>IP ADDRESS</th>
                      <th>PORT</th>
                      <th>COUNTRY</th>
                      <th>STATUS</th>
                      <th>RESULT</th>
                      <th>SUCCESS REASON</th>
                      <th>COMPLETED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedItems.map((item) => (
                      <tr key={item.id}>
                        <td className="op-ip">{item.ip}</td>
                        <td className="op-mono op-strong">{item.port ?? "—"}</td>
                        <td className="op-dim">{item.country ?? "—"}</td>
                        <td>
                          <span className={`op-pill ${statusTone(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td
                          className="op-dim"
                          style={{ maxWidth: 360, whiteSpace: "normal" }}
                        >
                          {item.result_summary ?? "—"}
                        </td>
                        <td
                          className="op-dim"
                          style={{ maxWidth: 280, whiteSpace: "normal" }}
                        >
                          {item.success_reason ?? "—"}
                        </td>
                        <td className="op-faint">
                          {dateLabel(item.completed_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal footer: item pager + link */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 20px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {itemCount > ITEMS_PER_PAGE ? (
                <div className="op-pager" style={{ margin: 0 }}>
                  <button
                    type="button"
                    className="op-btn op-btnXs"
                    onClick={() => setItemPage((p) => Math.max(1, p - 1))}
                    disabled={safeItemPage <= 1}
                  >
                    PREV
                  </button>
                  <span className="op-pageInfo">
                    PAGE {safeItemPage} / {itemPageCount} · {itemCount} ITEMS
                  </span>
                  <button
                    type="button"
                    className="op-btn op-btnXs"
                    onClick={() =>
                      setItemPage((p) => Math.min(itemPageCount, p + 1))
                    }
                    disabled={safeItemPage >= itemPageCount}
                  >
                    NEXT
                  </button>
                </div>
              ) : (
                <span className="op-pageInfo">{itemCount} ITEMS</span>
              )}

              <Link
                href="/successful-results"
                className="op-btn op-btnOk op-btnXs"
              >
                VIEW SUCCESSFUL RESULTS →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalStat({ label, value }: { label: string; value: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.08)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--dim, #8a8f99)", letterSpacing: 0.5 }}>
        {label}
      </span>
      <b style={{ fontFamily: "var(--font-mono), monospace" }}>{value}</b>
    </span>
  );
}
