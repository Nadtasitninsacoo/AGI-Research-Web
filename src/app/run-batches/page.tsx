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
  XCircle,
} from "lucide-react";

import { Navbar } from "@/components/hud/Navbar";
import { Sidebar } from "@/components/hud/Sidebar";

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

function statusClass(status: string): string {
  switch (status.toUpperCase()) {
    case "COMPLETED":
    case "SUCCEEDED":
      return "text-emerald-400";
    case "FAILED":
      return "text-rose-400";
    case "PROCESSING":
      return "text-cyan-400";
    case "CANCELLED":
      return "text-slate-400";
    default:
      return "text-amber-400";
  }
}

export default function RunBatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

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

  const total = batches.reduce((sum, batch) => sum + batch.total_items, 0);
  const succeeded = batches.reduce(
    (sum, batch) => sum + batch.succeeded_items,
    0,
  );
  const failed = batches.reduce(
    (sum, batch) => sum + batch.failed_items,
    0,
  );

  return (
    <div className="shell" style={{ background: "#090a0f" }}>
      <Sidebar online={!error} />

      <div className="main flex min-w-0 flex-col bg-[#090a0f] text-slate-100">
        <Navbar online={!error} title="RUN BATCHES" link="API" />

        <main className="flex-1 space-y-4 p-4 md:p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-cyan-400">
                <Activity size={13} />
                AGI RESEARCH / OPERATIONS
              </div>

              <h1 className="text-lg font-bold tracking-widest text-white">
                RUN BATCH CONTROL
              </h1>

              <p className="mt-1 text-[10px] tracking-wider text-slate-500">
                ติดตาม Batch และตรวจสอบรายการ Metadata ที่อยู่ในคิว
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadBatches()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded border border-[#303649] bg-[#0e1017] px-4 py-2 text-[10px] font-bold tracking-widest text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              REFRESH
            </button>
          </header>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] text-rose-300"
            >
              <XCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Metrics */}

          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: "TOTAL BATCHES", value: batches.length, icon: Layers3, color: "text-cyan-400" },
              { label: "TOTAL ITEMS", value: total, icon: Activity, color: "text-blue-400" },
              { label: "SUCCEEDED", value: succeeded, icon: CheckCircle2, color: "text-emerald-400" },
              { label: "FAILED", value: failed, icon: XCircle, color: "text-rose-400" },
            ].map((stat) => {
              const IconComponent = stat.icon;
              return (
                <article
                  key={stat.label}
                  className="rounded border border-[#303649] bg-[#0e1017] p-4"
                >
                  <div className="flex items-center justify-between text-[9px] font-bold tracking-widest text-slate-500">
                    {stat.label}
                    <IconComponent size={15} className={stat.color} />
                  </div>

                  <div className="mt-3 font-mono text-3xl font-semibold tabular-nums text-white">
                    {stat.value}
                  </div>
                </article>
              );
            })}
          </section>

          {/* Batch history */}

          <section className="overflow-hidden rounded border border-[#303649] bg-[#0e1017]">
            <div className="flex items-center justify-between border-b border-[#252b3b] px-4 py-3">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-red-400" />
                <h2 className="text-xs font-bold tracking-widest text-white">
                  BATCH HISTORY
                </h2>
              </div>

              <span className="text-[9px] tracking-wider text-slate-500">
                {batches.length} RECORDS
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-[11px] tracking-wider text-cyan-400">
                <RefreshCw className="mx-auto mb-2 animate-spin" size={18} />
                LOADING BATCHES...
              </div>
            ) : batches.length === 0 ? (
              <div className="p-8 text-center text-[11px] text-slate-600">
                ยังไม่มี Batch ในระบบ
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[11px]">
                  <thead className="bg-[#171b27] text-[9px] tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">BATCH</th>
                      <th className="px-4 py-2.5">PLAN ID</th>
                      <th className="px-4 py-2.5">STATUS</th>
                      <th className="px-4 py-2.5">ITEMS</th>
                      <th className="px-4 py-2.5">SUCCEEDED</th>
                      <th className="px-4 py-2.5">CREATED</th>
                      <th className="px-4 py-2.5">ACTION</th>
                    </tr>
                  </thead>

                  <tbody>
                    {batches.map((batch) => (
                      <tr
                        key={batch.id}
                        className="border-t border-[#252b3b] hover:bg-white/5"
                      >
                        <td className="px-4 py-2.5 font-semibold text-white">
                          #{batch.batch_number}
                          <div className="text-[9px] font-normal text-slate-500">
                            ID {batch.id}
                          </div>
                        </td>

                        <td className="px-4 py-2.5 font-mono text-slate-300">
                          #{batch.plan_id}
                        </td>

                        <td
                          className={`px-4 py-2.5 text-[10px] font-bold ${statusClass(batch.status)}`}
                        >
                          {batch.status}
                        </td>

                        <td className="px-4 py-2.5 font-mono tabular-nums text-white">
                          {batch.total_items}
                        </td>

                        <td className="px-4 py-2.5 font-mono tabular-nums text-emerald-400">
                          {batch.succeeded_items}
                        </td>

                        <td className="px-4 py-2.5 text-[10px] text-slate-400">
                          {dateLabel(batch.created_at)}
                        </td>

                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => void loadDetail(batch.id)}
                            className="inline-flex items-center gap-1 rounded border border-[#303649] px-3 py-1.5 text-[9px] font-bold tracking-wider text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300"
                          >
                            <Eye size={13} />
                            VIEW
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Batch detail */}

          {selected && (
            <section className="overflow-hidden rounded border border-[#303649] bg-[#0e1017]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252b3b] px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-cyan-400" />
                    <h2 className="text-xs font-bold tracking-widest text-white">
                      BATCH #{selected.batch_number} / ITEMS
                    </h2>
                  </div>

                  <p className="mt-1 text-[9px] tracking-wider text-slate-500">
                    Batch ID {selected.id} · {selected.items.length} รายการ
                  </p>
                </div>

                {detailLoading && (
                  <RefreshCw size={16} className="animate-spin text-cyan-400" />
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[11px]">
                  <thead className="bg-[#171b27] text-[9px] tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">IP ADDRESS</th>
                      <th className="px-4 py-2.5">PORT</th>
                      <th className="px-4 py-2.5">COUNTRY</th>
                      <th className="px-4 py-2.5">STATUS</th>
                      <th className="px-4 py-2.5">RESULT</th>
                      <th className="px-4 py-2.5">COMPLETED</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selected.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-[#252b3b] hover:bg-white/5"
                      >
                        <td className="px-4 py-2.5 font-mono text-cyan-300">
                          {item.ip}
                        </td>

                        <td className="px-4 py-2.5 font-mono text-white">
                          {item.port ?? "—"}
                        </td>

                        <td className="px-4 py-2.5 text-slate-300">
                          {item.country ?? "—"}
                        </td>

                        <td
                          className={`px-4 py-2.5 text-[10px] font-bold ${statusClass(item.status)}`}
                        >
                          {item.status}
                        </td>

                        <td className="max-w-xs truncate px-4 py-2.5 text-[10px] text-slate-400">
                          {item.result_summary ?? "—"}
                        </td>

                        <td className="px-4 py-2.5 text-[10px] text-slate-500">
                          {dateLabel(item.completed_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-[#252b3b] px-4 py-3">
                <Link
                  href="/successful-results"
                  className="text-[10px] font-bold tracking-wider text-cyan-400 transition hover:text-cyan-300"
                >
                  VIEW SUCCESSFUL RESULTS →
                </Link>
              </div>
            </section>
          )}

          <p className="flex items-center gap-2 text-[9px] leading-relaxed text-slate-600">
            <Clock3 size={13} />
            Batch records are read from stored metadata. No network operation is
            performed by this page.
          </p>
        </main>
      </div>
    </div>
  );
}
