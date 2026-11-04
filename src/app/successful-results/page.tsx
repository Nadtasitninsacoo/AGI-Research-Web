"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  CheckCircle2,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
  Globe,
  FileText,
  History,
} from "lucide-react";

import { Navbar } from "@/components/hud/Navbar";
import { Sidebar } from "@/components/hud/Sidebar";
import "@/styles/ops.css";

type Batch = {
  id: number;
  batch_number: number;
  plan_id: number;
};

type SuccessfulItem = {
  id: number;
  plan_target_id: number;
  ip: string;
  port: number | null;
  country: string | null;
  target_type: string | null;
  service: string | null;
  status: string;
  result_summary: string | null;
  success_reason: string | null;
  created_at: string;
  completed_at: string | null;
  batch_id: number;
  batch_number: number;
  plan_id: number;
};

type HttpObservation = {
  id: number;
  item_id: number;
  batch_id: number;
  status_code: number | null;
  content_type: string | null;
  server: string | null;
  title: string | null;
  observed_at: string | null;
  created_at: string;
};

type AuditLog = {
  id: number;
  batch_id: number;
  item_id: number | null;
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  created_at: string;
};

type BatchDetailResult = {
  items: SuccessfulItem[];
  httpObservations: HttpObservation[];
  auditLogs: AuditLog[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function unwrapArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  if (isRecord(value) && Array.isArray(value.data)) {
    return value.data;
  }

  if (isRecord(value) && Array.isArray(value.items)) {
    return value.items;
  }

  return [];
}

function unwrapObject(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;

  if (isRecord(value.data)) {
    return value.data;
  }

  return value;
}

function formatDate(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function normalizeBatch(value: unknown): Batch | null {
  if (!isRecord(value)) return null;

  const id = toNumber(value.id);
  const batchNumber = toNumber(value.batch_number);
  const planId = toNumber(value.plan_id);

  if (id === null || batchNumber === null || planId === null) {
    return null;
  }

  return {
    id,
    batch_number: batchNumber,
    plan_id: planId,
  };
}

function normalizeSuccessfulItem(
  value: unknown,
  batch: Batch,
): SuccessfulItem | null {
  if (!isRecord(value)) return null;

  const id = toNumber(value.id);
  const planTargetId = toNumber(value.plan_target_id);

  if (
    id === null ||
    planTargetId === null ||
    typeof value.ip !== "string" ||
    typeof value.status !== "string" ||
    value.status.toUpperCase() !== "SUCCEEDED"
  ) {
    return null;
  }

  return {
    id,
    plan_target_id: planTargetId,
    ip: value.ip,
    port: toNumber(value.port),
    country: toNullableString(value.country),
    target_type: toNullableString(value.target_type),
    service: toNullableString(value.service),
    status: value.status,
    result_summary: toNullableString(value.result_summary),
    success_reason: toNullableString(value.success_reason),
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    completed_at: toNullableString(value.completed_at),
    batch_id: batch.id,
    batch_number: batch.batch_number,
    plan_id: batch.plan_id,
  };
}

function normalizeHttpObservation(
  value: unknown,
  batchId: number,
): HttpObservation | null {
  if (!isRecord(value)) return null;

  const id = toNumber(value.id);
  const itemId = toNumber(value.item_id);

  if (id === null || itemId === null) return null;

  return {
    id,
    item_id: itemId,
    batch_id: batchId,
    status_code: toNumber(value.status_code),
    content_type: toNullableString(value.content_type),
    server: toNullableString(value.server),
    title: toNullableString(value.title),
    observed_at: toNullableString(value.observed_at),
    created_at: typeof value.created_at === "string" ? value.created_at : "",
  };
}

function normalizeAuditLog(value: unknown, batchId: number): AuditLog | null {
  if (!isRecord(value)) return null;

  const id = toNumber(value.id);

  if (id === null || typeof value.action !== "string") {
    return null;
  }

  return {
    id,
    batch_id: toNumber(value.batch_id) ?? batchId,
    item_id: toNumber(value.item_id),
    actor_id: toNumber(value.actor_id),
    actor_name: toNullableString(value.actor_name),
    action: value.action,
    previous_status: toNullableString(value.previous_status),
    new_status: toNullableString(value.new_status),
    reason: toNullableString(value.reason),
    created_at: typeof value.created_at === "string" ? value.created_at : "",
  };
}

function getLatestObservation(
  observations: HttpObservation[],
  itemId: number,
): HttpObservation | undefined {
  return observations
    .filter((observation) => observation.item_id === itemId)
    .sort((a, b) => {
      const aTime = new Date(a.observed_at ?? a.created_at).getTime();

      const bTime = new Date(b.observed_at ?? b.created_at).getTime();

      return bTime - aTime;
    })[0];
}

export default function SuccessfulResultsPage() {
  const [items, setItems] = useState<SuccessfulItem[]>([]);
  const [httpObservations, setHttpObservations] = useState<HttpObservation[]>(
    [],
  );
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [obsPage, setObsPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [sumPage, setSumPage] = useState(1);

  const loadResults = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");

    try {
      const batchResponse = await fetch("/api/run-batches", {
        cache: "no-store",
        signal,
      });

      if (!batchResponse.ok) {
        throw new Error(
          batchResponse.status === 401 || batchResponse.status === 403
            ? "ไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาตรวจสอบ API Token"
            : `โหลด Batch ไม่สำเร็จ (${batchResponse.status})`,
        );
      }

      const batchPayload: unknown = await batchResponse.json();

      const batches = unwrapArray(batchPayload)
        .map(normalizeBatch)
        .filter((batch): batch is Batch => batch !== null);

      const detailResults = await Promise.all(
        batches.map(async (batch): Promise<BatchDetailResult> => {
          const response = await fetch(`/api/run-batches/${batch.id}`, {
            cache: "no-store",
            signal,
          });

          if (!response.ok) {
            throw new Error(
              `โหลดรายละเอียด Batch #${batch.id} ไม่สำเร็จ (${response.status})`,
            );
          }

          const payload: unknown = await response.json();
          const detail = unwrapObject(payload);

          if (!detail) {
            return {
              items: [],
              httpObservations: [],
              auditLogs: [],
            };
          }

          const successfulItems = unwrapArray(detail.items)
            .map((item) => normalizeSuccessfulItem(item, batch))
            .filter((item): item is SuccessfulItem => item !== null);

          const observations = unwrapArray(detail.httpObservations)
            .map((item) => normalizeHttpObservation(item, batch.id))
            .filter((item): item is HttpObservation => item !== null);

          const logs = unwrapArray(detail.auditLogs)
            .map((item) => normalizeAuditLog(item, batch.id))
            .filter((item): item is AuditLog => item !== null);

          return {
            items: successfulItems,
            httpObservations: observations,
            auditLogs: logs,
          };
        }),
      );

      const allItems = detailResults.flatMap((result) => result.items);

      const uniqueItems = new Map<string, SuccessfulItem>();

      for (const item of allItems) {
        uniqueItems.set(`${item.batch_id}:${item.id}`, item);
      }

      const sortedItems = [...uniqueItems.values()].sort((a, b) => {
        const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;

        const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;

        return bTime - aTime;
      });

      const successfulItemIds = new Set(sortedItems.map((item) => item.id));

      const allObservations = detailResults
        .flatMap((result) => result.httpObservations)
        .filter((observation) => successfulItemIds.has(observation.item_id));

      const uniqueObservations = new Map<string, HttpObservation>();

      for (const observation of allObservations) {
        uniqueObservations.set(
          `${observation.batch_id}:${observation.id}`,
          observation,
        );
      }

      const allAuditLogs = detailResults.flatMap((result) => result.auditLogs);

      const uniqueAuditLogs = new Map<string, AuditLog>();

      for (const log of allAuditLogs) {
        uniqueAuditLogs.set(`${log.batch_id}:${log.id}`, log);
      }

      setItems(sortedItems);
      setHttpObservations([...uniqueObservations.values()]);
      setAuditLogs(
        [...uniqueAuditLogs.values()].sort((a, b) => {
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }),
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      setError(err instanceof Error ? err.message : "โหลดผลลัพธ์ไม่สำเร็จ");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void loadResults(controller.signal);

    return () => controller.abort();
  }, [loadResults]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return items;

    return items.filter((item) => {
      const observation = getLatestObservation(httpObservations, item.id);

      const relatedLogs = auditLogs
        .filter(
          (log) =>
            log.batch_id === item.batch_id &&
            (log.item_id === null || log.item_id === item.id),
        )
        .map((log) =>
          [
            log.action,
            log.actor_name ?? "",
            log.reason ?? "",
            log.previous_status ?? "",
            log.new_status ?? "",
          ].join(" "),
        )
        .join(" ");

      return [
        item.ip,
        item.port === null ? "" : String(item.port),
        item.country ?? "",
        item.target_type ?? "",
        item.service ?? "",
        item.success_reason ?? "",
        item.result_summary ?? "",
        String(item.batch_id),
        observation?.status_code ?? "",
        observation?.content_type ?? "",
        observation?.server ?? "",
        observation?.title ?? "",
        relatedLogs,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [items, httpObservations, auditLogs, search]);

  const successfulItemIds = useMemo(
    () => new Set(items.map((item) => item.id)),
    [items],
  );

  const visibleObservations = useMemo(
    () =>
      httpObservations.filter((observation) =>
        successfulItemIds.has(observation.item_id),
      ),
    [httpObservations, successfulItemIds],
  );

  const portRecords = items.filter((item) => item.port !== null).length;

  const PER_PAGE = 20;

  useEffect(() => {
    setPage(1);
  }, [search]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PER_PAGE));

  const safePage = Math.min(page, pageCount);

  const pagedItems = filteredItems.slice(
    (safePage - 1) * PER_PAGE,
    safePage * PER_PAGE,
  );

  // HTTP observations pagination
  const obsPageCount = Math.max(
    1,
    Math.ceil(visibleObservations.length / PER_PAGE),
  );
  const safeObsPage = Math.min(obsPage, obsPageCount);
  const pagedObs = visibleObservations.slice(
    (safeObsPage - 1) * PER_PAGE,
    safeObsPage * PER_PAGE,
  );

  // Audit logs pagination
  const logPageCount = Math.max(1, Math.ceil(auditLogs.length / PER_PAGE));
  const safeLogPage = Math.min(logPage, logPageCount);
  const pagedLogs = auditLogs.slice(
    (safeLogPage - 1) * PER_PAGE,
    safeLogPage * PER_PAGE,
  );

  // Result summary pagination
  const sumPageCount = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const safeSumPage = Math.min(sumPage, sumPageCount);
  const pagedSummary = items.slice(
    (safeSumPage - 1) * PER_PAGE,
    safeSumPage * PER_PAGE,
  );

  function exportCsv() {
    const header = [
      "IP Address",
      "Port",
      "Country",
      "Target Type",
      "Service",
      "Status",
      "Success Reason",
      "Result Summary",
      "HTTP Status",
      "HTTP Content Type",
      "HTTP Server",
      "HTTP Title",
      "Batch ID",
      "Batch Number",
      "Completed At",
    ];

    const rows = filteredItems.map((item) => {
      const observation = getLatestObservation(httpObservations, item.id);

      return [
        item.ip,
        item.port ?? "",
        item.country ?? "",
        item.target_type ?? "",
        item.service ?? "",
        item.status,
        item.success_reason ?? "",
        item.result_summary ?? "",
        observation?.status_code ?? "",
        observation?.content_type ?? "",
        observation?.server ?? "",
        observation?.title ?? "",
        item.batch_id,
        item.batch_number,
        item.completed_at ?? "",
      ];
    });

    const escapeCsv = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "successful-results.csv";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="shell" style={{ background: "#090a0f" }}>
      <Sidebar online={!error} />

      <div className="main flex min-w-0 flex-col">
        <Navbar online={!error} title="SUCCESSFUL RESULTS" link="API" />

        <main className="op-page">
          <header className="op-hero op-toneOk">
            <div>
              <div className="op-kicker">
                <ShieldCheck size={13} />
                AGI RESEARCH / VERIFIED METADATA
              </div>

              <h1 className="op-h1">
                Successful <b>Results</b>
              </h1>

              <p className="op-sub">
                รายการ IP/Port ที่มีสถานะ SUCCEEDED พร้อมข้อมูล Metadata
                และประวัติ Audit จากฐานข้อมูล
              </p>
            </div>

            <div className="op-actions">
              <button
                type="button"
                onClick={() => void loadResults()}
                disabled={loading}
                className="op-btn"
              >
                <RefreshCw className={loading ? "op-spin" : ""} />
                REFRESH
              </button>

              <button
                type="button"
                onClick={exportCsv}
                disabled={filteredItems.length === 0}
                className="op-btn op-btnOk"
              >
                <ArrowDownToLine />
                EXPORT CSV
              </button>
            </div>
          </header>

          {error && (
            <div role="alert" className="op-alert">
              <XCircle />
              {error}
            </div>
          )}

          <section
            className="op-stats"
            style={{ "--op-cols": 4 } as CSSProperties}
          >
            <article className="op-stat op-ok">
              <div className="op-statHead">
                SUCCESSFUL RECORDS
                <span className="op-statIcon">
                  <CheckCircle2 />
                </span>
              </div>
              <div className="op-statValue">{items.length}</div>
              <div className="op-bar" aria-hidden>
                <i
                  style={{
                    width: items.length > 0 ? "100%" : "0%",
                  }}
                />
              </div>
            </article>

            <article className="op-stat op-cyan">
              <div className="op-statHead">
                IP RECORDS
                <span className="op-statIcon">
                  <Database />
                </span>
              </div>
              <div className="op-statValue">{items.length}</div>
              <div className="op-bar" aria-hidden>
                <i
                  style={{
                    width: items.length > 0 ? "100%" : "0%",
                  }}
                />
              </div>
            </article>

            <article className="op-stat op-blue">
              <div className="op-statHead">
                PORT RECORDS
                <span className="op-statIcon">
                  <Database />
                </span>
              </div>
              <div className="op-statValue">{portRecords}</div>
              <div className="op-bar" aria-hidden>
                <i
                  style={{
                    width: `${
                      items.length > 0
                        ? Math.round((portRecords / items.length) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </article>

            <article className="op-stat op-cyan">
              <div className="op-statHead">
                HTTP OBSERVATIONS
                <span className="op-statIcon">
                  <Globe />
                </span>
              </div>
              <div className="op-statValue">{visibleObservations.length}</div>
              <div className="op-bar" aria-hidden>
                <i
                  style={{
                    width: visibleObservations.length > 0 ? "100%" : "0%",
                  }}
                />
              </div>
            </article>
          </section>

          <section className="op-panel op-panelOk">
            <div className="op-head">
              <h2 className="op-title">
                <span className="op-chip">
                  <ShieldCheck />
                </span>
                <span>
                  APPROVED METADATA RECORDS
                  <span className="op-titleSub">
                    แสดง {filteredItems.length} จาก {items.length} รายการ
                  </span>
                </span>
              </h2>

              <label className="op-search">
                <Search />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ค้นหา IP, Port, Service, HTTP..."
                  aria-label="Search records"
                />
              </label>
            </div>

            {loading ? (
              <div className="op-empty op-loading">
                <RefreshCw className="op-spin" size={18} />
                LOADING SUCCESSFUL RECORDS...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="op-empty">
                <span className="op-emptyIcon">
                  <Database />
                </span>
                <p className="op-emptyTitle">
                  {items.length === 0
                    ? "ยังไม่มีรายการที่ผ่านการประเมิน"
                    : "ไม่พบข้อมูลที่ตรงกับคำค้นหา"}
                </p>
                <p className="op-emptySub">
                  รายการจะแสดงเมื่อ Backend บันทึกสถานะ SUCCEEDED แล้วเท่านั้น
                </p>
              </div>
            ) : (
              <div className="op-tableWrap">
                <table className="op-table" style={{ minWidth: 1250 }}>
                  <thead>
                    <tr>
                      <th>IP ADDRESS</th>
                      <th>PORT</th>
                      <th>TYPE</th>
                      <th>SERVICE</th>
                      <th>COUNTRY</th>
                      <th>HTTP</th>
                      <th>STATUS</th>
                      <th>SUCCESS REASON</th>
                      <th>BATCH</th>
                      <th>COMPLETED AT</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pagedItems.map((item) => {
                      const observation = getLatestObservation(
                        httpObservations,
                        item.id,
                      );

                      return (
                        <tr key={`${item.batch_id}-${item.id}`}>
                          <td className="op-ip">{item.ip}</td>

                          <td className="op-mono op-strong">
                            {item.port ?? "—"}
                          </td>

                          <td className="op-dim">{item.target_type ?? "—"}</td>

                          <td className="op-dim">{item.service ?? "—"}</td>

                          <td className="op-dim">{item.country ?? "—"}</td>

                          <td className="op-mono">
                            {observation?.status_code ?? "—"}
                          </td>

                          <td>
                            <span className="op-pill op-pill-ok">
                              SUCCEEDED
                            </span>
                          </td>

                          <td
                            className="op-dim op-trunc"
                            title={
                              item.success_reason ??
                              item.result_summary ??
                              undefined
                            }
                          >
                            {item.success_reason ?? item.result_summary ?? "—"}
                          </td>

                          <td className="op-mono op-dim">
                            #{item.batch_number}
                          </td>

                          <td className="op-faint">
                            {formatDate(item.completed_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filteredItems.length > PER_PAGE && (
              <div className="op-pager">
                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={safePage <= 1}
                >
                  PREV
                </button>

                <span className="op-pageInfo">
                  PAGE {safePage} / {pageCount} · {filteredItems.length} RECORDS
                </span>

                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                  disabled={safePage >= pageCount}
                >
                  NEXT
                </button>
              </div>
            )}
          </section>

          <section className="op-panel">
            <div className="op-head">
              <h2 className="op-title">
                <span className="op-chip">
                  <Globe />
                </span>
                <span>
                  HTTP OBSERVATIONS
                  <span className="op-titleSub">
                    ข้อมูล HTTP Metadata ที่ Backend บันทึกไว้จริง
                  </span>
                </span>
              </h2>
            </div>

            {visibleObservations.length === 0 ? (
              <div className="op-empty">
                <p className="op-emptyTitle">ยังไม่มี HTTP Metadata</p>
                <p className="op-emptySub">
                  ตาราง run_batch_http_observations ยังไม่มีข้อมูล สำหรับรายการ
                  Successful Results เหล่านี้
                </p>
              </div>
            ) : (
              <div className="op-tableWrap">
                <table className="op-table" style={{ minWidth: 950 }}>
                  <thead>
                    <tr>
                      <th>ITEM ID</th>
                      <th>HTTP STATUS</th>
                      <th>CONTENT TYPE</th>
                      <th>SERVER</th>
                      <th>PAGE TITLE</th>
                      <th>OBSERVED AT</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pagedObs.map((observation) => (
                      <tr key={`${observation.batch_id}-${observation.id}`}>
                        <td className="op-mono">#{observation.item_id}</td>
                        <td className="op-mono op-strong">
                          {observation.status_code ?? "—"}
                        </td>
                        <td className="op-dim">
                          {observation.content_type ?? "—"}
                        </td>
                        <td className="op-dim">{observation.server ?? "—"}</td>
                        <td className="op-dim">{observation.title ?? "—"}</td>
                        <td className="op-faint">
                          {formatDate(observation.observed_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {visibleObservations.length > PER_PAGE && (
              <div className="op-pager">
                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() => setObsPage((c) => Math.max(1, c - 1))}
                  disabled={safeObsPage <= 1}
                >
                  PREV
                </button>
                <span className="op-pageInfo">
                  PAGE {safeObsPage} / {obsPageCount} ·{" "}
                  {visibleObservations.length} OBSERVATIONS
                </span>
                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() =>
                    setObsPage((c) => Math.min(obsPageCount, c + 1))
                  }
                  disabled={safeObsPage >= obsPageCount}
                >
                  NEXT
                </button>
              </div>
            )}
          </section>

          <section className="op-panel">
            <div className="op-head">
              <h2 className="op-title">
                <span className="op-chip">
                  <History />
                </span>
                <span>
                  AUDIT LOGS
                  <span className="op-titleSub">
                    ประวัติการเปลี่ยนแปลงจาก run_audit_logs
                  </span>
                </span>
              </h2>
            </div>

            {auditLogs.length === 0 ? (
              <div className="op-empty">
                <p className="op-emptyTitle">ยังไม่มี Audit Logs</p>
                <p className="op-emptySub">
                  ยังไม่มีประวัติการเปลี่ยนแปลงที่บันทึกไว้ในฐานข้อมูล
                </p>
              </div>
            ) : (
              <div className="op-tableWrap">
                <table className="op-table" style={{ minWidth: 950 }}>
                  <thead>
                    <tr>
                      <th>BATCH</th>
                      <th>ITEM ID</th>
                      <th>ACTOR</th>
                      <th>ACTION</th>
                      <th>PREVIOUS STATUS</th>
                      <th>NEW STATUS</th>
                      <th>REASON</th>
                      <th>CREATED AT</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pagedLogs.map((log) => (
                      <tr key={`${log.batch_id}-${log.id}`}>
                        <td className="op-mono">#{log.batch_id}</td>

                        <td className="op-mono">{log.item_id ?? "—"}</td>

                        <td className="op-dim">
                          {log.actor_name ??
                            (log.actor_id !== null
                              ? `User #${log.actor_id}`
                              : "System / Unknown")}
                        </td>

                        <td className="op-strong">{log.action}</td>

                        <td className="op-dim">{log.previous_status ?? "—"}</td>

                        <td className="op-dim">{log.new_status ?? "—"}</td>

                        <td
                          className="op-dim op-trunc"
                          title={log.reason ?? undefined}
                        >
                          {log.reason ?? "—"}
                        </td>

                        <td className="op-faint">
                          {formatDate(log.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {auditLogs.length > PER_PAGE && (
              <div className="op-pager">
                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() => setLogPage((c) => Math.max(1, c - 1))}
                  disabled={safeLogPage <= 1}
                >
                  PREV
                </button>
                <span className="op-pageInfo">
                  PAGE {safeLogPage} / {logPageCount} · {auditLogs.length} LOGS
                </span>
                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() =>
                    setLogPage((c) => Math.min(logPageCount, c + 1))
                  }
                  disabled={safeLogPage >= logPageCount}
                >
                  NEXT
                </button>
              </div>
            )}
          </section>

          <section className="op-panel">
            <div className="op-head">
              <h2 className="op-title">
                <span className="op-chip">
                  <FileText />
                </span>
                <span>
                  RESULT SUMMARY
                  <span className="op-titleSub">
                    รายละเอียดผลลัพธ์จาก Batch Items
                  </span>
                </span>
              </h2>
            </div>

            {items.length === 0 ? (
              <div className="op-empty">
                <p className="op-emptyTitle">ไม่มี Result Summary</p>
              </div>
            ) : (
              <div className="op-tableWrap">
                <table className="op-table" style={{ minWidth: 850 }}>
                  <thead>
                    <tr>
                      <th>IP ADDRESS</th>
                      <th>BATCH</th>
                      <th>SUCCESS REASON</th>
                      <th>RESULT SUMMARY</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pagedSummary.map((item) => (
                      <tr key={`${item.batch_id}-${item.id}`}>
                        <td className="op-ip">{item.ip}</td>
                        <td className="op-mono">#{item.batch_number}</td>
                        <td className="op-dim">{item.success_reason ?? "—"}</td>
                        <td className="op-dim">{item.result_summary ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {items.length > PER_PAGE && (
              <div className="op-pager">
                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() => setSumPage((c) => Math.max(1, c - 1))}
                  disabled={safeSumPage <= 1}
                >
                  PREV
                </button>
                <span className="op-pageInfo">
                  PAGE {safeSumPage} / {sumPageCount} · {items.length} RECORDS
                </span>
                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() => setSumPage((c) => Math.min(sumPageCount, c + 1))}
                  disabled={safeSumPage >= sumPageCount}
                >
                  NEXT
                </button>
              </div>
            )}
          </section>

          <footer className="op-foot">
            <span>FILTER: STATUS = SUCCEEDED</span>

            <Link href="/run-batches" className="op-link">
              ← BACK TO RUN BATCHES
            </Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
