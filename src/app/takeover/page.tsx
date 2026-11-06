"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Database,
  RefreshCw,
  Radar,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Navbar } from "@/components/hud/Navbar";
import { Sidebar } from "@/components/hud/Sidebar";
import { usePersistentState } from "@/lib/usePersistentState";

import { Metric } from "./components/Metric";
import { NotificationStack } from "./components/NotificationStack";
import { useNotifications } from "./hooks/useNotifications";
import { useTakeoverData } from "./hooks/useTakeoverData";
import { scanIpsForVulns } from "./scan-actions";
import { targetKey, formatTime } from "./utils";
import {
  assessTarget,
  compareBySeverity,
  SEVERITIES,
  SEVERITY_META,
  type RiskAssessment,
  type Severity,
} from "./utils/risk";

type SeverityFilter = Severity | "ALL";
type CveFilter = "all" | "with" | "without";

export default function VulnerabilityAnalysisPage() {
  const { notifications, notify, dismissNotification } = useNotifications();

  const {
    targets,
    targetMessage,
    agentMessage,
    loading,
    refreshing,
    refreshData,
  } = useTakeoverData();

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] =
    usePersistentState<SeverityFilter>("vuln.severityFilter", "ALL");
  const [cveFilter, setCveFilter] = usePersistentState<CveFilter>(
    "vuln.cveFilter",
    "all",
  );
  const [clock, setClock] = useState("--:--:--");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const tick = () => setClock(formatTime());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // -- Risk assessment over all saved targets ------------------------------
  const assessments = useMemo<RiskAssessment[]>(
    () =>
      targets
        .map((t) => assessTarget(t, targetKey(t)))
        .sort(compareBySeverity),
    [targets],
  );

  const stats = useMemo(() => {
    const uniqueIps = new Set(targets.map((t) => t.ip)).size;
    const withCves = assessments.filter((a) => a.target.cves > 0).length;
    const totalCves = targets.reduce(
      (sum, t) => sum + Math.max(0, Number(t.cves ?? 0)),
      0,
    );
    const bySeverity = SEVERITIES.reduce<Record<Severity, number>>(
      (acc, s) => {
        acc[s] = assessments.filter((a) => a.severity === s).length;
        return acc;
      },
      { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
    );
    const criticalHigh = bySeverity.CRITICAL + bySeverity.HIGH;
    return { uniqueIps, withCves, totalCves, bySeverity, criticalHigh };
  }, [targets, assessments]);

  const maxSeverityCount = useMemo(
    () => Math.max(1, ...SEVERITIES.map((s) => stats.bySeverity[s])),
    [stats],
  );

  // -- Filtered table ------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assessments.filter((a) => {
      if (severityFilter !== "ALL" && a.severity !== severityFilter)
        return false;
      if (cveFilter === "with" && a.target.cves <= 0) return false;
      if (cveFilter === "without" && a.target.cves > 0) return false;
      if (q) {
        const hay =
          `${a.target.ip} ${a.target.port} ${a.target.service ?? ""} ${
            a.target.hostname ?? ""
          }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assessments, search, severityFilter, cveFilter]);

  const topPriority = useMemo(
    () => assessments.filter((a) => a.severity === "CRITICAL" || a.severity === "HIGH").slice(0, 6),
    [assessments],
  );

  async function handleRefresh() {
    await refreshData();
    notify("อัปเดตแล้ว", "โหลดข้อมูล asset ล่าสุดจากฐานข้อมูลเรียบร้อย", "success");
  }

  // Passive CVE scan over the unique IPs currently shown in the table.
  async function handleScan() {
    if (scanning) return;
    const ips = Array.from(new Set(filtered.map((a) => a.target.ip)));
    if (!ips.length) {
      notify("สแกนไม่ได้", "ไม่มี asset ในตารางให้สแกน", "warning");
      return;
    }
    setScanning(true);
    notify("กำลังสแกน", `ค้นหา CVE จาก InternetDB สำหรับ ${ips.length} IP...`, "info");
    try {
      const result = await scanIpsForVulns(ips);
      if (result.ok) {
        notify("สแกนเสร็จ", result.message, "success");
        await refreshData();
      } else {
        notify("สแกนไม่สำเร็จ", result.message, "error");
      }
    } catch {
      notify("สแกนไม่สำเร็จ", "เกิดข้อผิดพลาดระหว่างสแกน", "error");
    } finally {
      setScanning(false);
    }
  }

  const online = !targetMessage;

  return (
    <div className="shell" style={{ background: "#090a0f" }}>
      <Sidebar online={online} />

      <NotificationStack
        notifications={notifications}
        onDismiss={dismissNotification}
      />

      <div
        id="vuln-page"
        className="takeover-page main flex min-w-0 flex-col bg-[#090a0f] text-slate-100"
      >
        <Navbar online={online} title="VULN ANALYSIS" link="DB" />

        <main className="flex-1 space-y-4 p-4 md:p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-400" />
                <h1 className="text-lg font-bold tracking-widest text-white">
                  NETWORK VULNERABILITY ANALYSIS
                </h1>
              </div>
              <p className="mt-1 text-[10px] tracking-wider text-slate-500">
                ASSET EXPOSURE / RISK PRIORITIZATION / REMEDIATION GUIDANCE
              </p>
            </div>

            <div className="flex items-center gap-3 rounded border border-[#252b3b] bg-[#0e1017] px-3 py-2">
              <div>
                <div
                  className={`text-[10px] font-bold ${
                    online ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {online ? "DATABASE ONLINE" : "DATABASE OFFLINE"}
                </div>
                <div className="text-[9px] text-slate-500">{clock}</div>
              </div>

              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="rounded border border-[#303649] p-2 text-slate-400 hover:text-white disabled:opacity-50"
                aria-label="Refresh data"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </header>

          {targetMessage ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
              {targetMessage}
            </div>
          ) : null}

          {/* KPI metrics */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="ASSETS (UNIQUE IP)"
              value={stats.uniqueIps}
              icon={<Server className="h-4 w-4 text-blue-400" />}
            />
            <Metric
              label="EXPOSED SERVICES"
              value={targets.length}
              icon={<Database className="h-4 w-4 text-cyan-400" />}
            />
            <Metric
              label="SERVICES WITH KNOWN CVEs"
              value={stats.withCves}
              icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
            />
            <Metric
              label="CRITICAL + HIGH"
              value={stats.criticalHigh}
              icon={<ShieldAlert className="h-4 w-4 text-red-400" />}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Severity distribution */}
            <section className="rounded border border-[#303649] bg-[#0e1017] p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-400" />
                <h2 className="text-xs font-bold tracking-widest text-white">
                  SEVERITY DISTRIBUTION
                </h2>
              </div>

              <div className="space-y-2.5">
                {SEVERITIES.map((s) => {
                  const count = stats.bySeverity[s];
                  const meta = SEVERITY_META[s];
                  const pct = Math.round((count / maxSeverityCount) * 100);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setSeverityFilter((prev) =>
                          prev === s ? "ALL" : s,
                        )
                      }
                      className={`w-full text-left ${
                        severityFilter === s ? "opacity-100" : "opacity-90"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between text-[10px] font-bold tracking-wider">
                        <span className={meta.text}>{meta.label}</span>
                        <span className="font-mono text-slate-300">
                          {count}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-[#090a0f]">
                        <div
                          className={`h-full ${meta.dot} transition-all`}
                          style={{ width: `${count === 0 ? 0 : Math.max(4, pct)}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-[9px] leading-relaxed text-slate-500">
                ความรุนแรงประเมินจากระดับการเปิดเผยบริการ + CVE จริงจาก InternetDB
                (passive OSINT, มี CVE-ID จริงแต่ยังไม่มีคะแนน CVSS) — ใช้จัดลำดับการแก้ไข
                กด SCAN FOR CVEs เพื่อดึง CVE-ID ล่าสุด · คลิกแถบเพื่อกรองตาราง
              </p>
            </section>

            {/* Top priority remediation */}
            <section className="rounded border border-[#303649] bg-[#0e1017] p-4 lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400" />
                <h2 className="text-xs font-bold tracking-widest text-white">
                  TOP PRIORITY REMEDIATION
                </h2>
              </div>

              {topPriority.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  {loading
                    ? "กำลังวิเคราะห์..."
                    : "ไม่พบ asset ระดับ Critical/High จากข้อมูลปัจจุบัน"}
                </p>
              ) : (
                <ul className="space-y-2">
                  {topPriority.map((a) => {
                    const meta = SEVERITY_META[a.severity];
                    return (
                      <li
                        key={a.key}
                        className={`rounded border ${meta.border} ${meta.bg} p-3`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-mono text-xs text-white">
                            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                            {a.target.ip}:{a.target.port}
                            <span className="text-slate-400">
                              {a.serviceLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-bold">
                            <span className={meta.text}>{meta.label}</span>
                            <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-slate-300">
                              {a.score}
                            </span>
                          </div>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                          {a.remediation}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* Asset table */}
          <section className="rounded border border-[#303649] bg-[#0e1017] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-widest text-white">
                ASSET RISK REGISTER
                <span className="ml-2 font-mono text-[10px] text-slate-500">
                  {filtered.length} / {assessments.length}
                </span>
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleScan()}
                  disabled={scanning || filtered.length === 0}
                  className="inline-flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-wider text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  title="ค้นหา CVE จริงจาก InternetDB (passive OSINT) สำหรับ IP ที่แสดงอยู่"
                >
                  <Radar className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
                  {scanning ? "กำลังสแกน..." : "SCAN FOR CVEs"}
                </button>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหา IP / host / service..."
                    className="w-56 rounded border border-[#303649] bg-[#090a0f] py-1.5 pl-8 pr-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
                  />
                </div>

                <select
                  value={severityFilter}
                  onChange={(e) =>
                    setSeverityFilter(e.target.value as SeverityFilter)
                  }
                  className="rounded border border-[#303649] bg-[#090a0f] px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="ALL">ทุกความรุนแรง</option>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_META[s].label}
                    </option>
                  ))}
                </select>

                <select
                  value={cveFilter}
                  onChange={(e) => setCveFilter(e.target.value as CveFilter)}
                  className="rounded border border-[#303649] bg-[#090a0f] px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="all">CVE: ทั้งหมด</option>
                  <option value="with">มี CVE</option>
                  <option value="without">ไม่มี CVE</option>
                </select>
              </div>
            </div>

            <div className="max-h-[520px] overflow-auto rounded border border-[#1c2130]">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[#0b0d14]">
                  <tr className="text-[9px] font-bold tracking-widest text-slate-500">
                    <th className="px-3 py-2.5">IP / HOST</th>
                    <th className="px-3 py-2.5">PORT</th>
                    <th className="px-3 py-2.5">SERVICE</th>
                    <th className="px-3 py-2.5">EXPOSURE</th>
                    <th className="px-3 py-2.5 text-center">CVEs</th>
                    <th className="px-3 py-2.5">SEVERITY</th>
                    <th className="px-3 py-2.5 text-center">SCORE</th>
                    <th className="px-3 py-2.5">REMEDIATION</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-3 py-10 text-center text-slate-500"
                      >
                        {loading ? "กำลังโหลด..." : "ไม่พบ asset ที่ตรงเงื่อนไข"}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((a) => {
                      const meta = SEVERITY_META[a.severity];
                      return (
                        <tr
                          key={a.key}
                          className="border-t border-[#161b28] align-top hover:bg-[#11141d]"
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-mono text-slate-200">
                              {a.target.ip}
                            </div>
                            {a.target.hostname ? (
                              <div className="text-[10px] text-slate-500">
                                {a.target.hostname}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-300">
                            {a.target.port}
                          </td>
                          <td className="px-3 py-2.5 text-slate-300">
                            {a.serviceLabel}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[10px] uppercase tracking-wider text-slate-400">
                              {a.exposureTier}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {a.target.vulnIds.length > 0 ? (
                              <div className="flex max-w-[220px] flex-wrap gap-1">
                                {a.target.vulnIds.slice(0, 6).map((cve) => (
                                  <a
                                    key={cve}
                                    href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] text-amber-300 hover:bg-amber-500/20"
                                  >
                                    {cve}
                                  </a>
                                ))}
                                {a.target.vulnIds.length > 6 ? (
                                  <span className="font-mono text-[9px] text-slate-500">
                                    +{a.target.vulnIds.length - 6}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span
                                className={`font-mono ${
                                  a.target.cves > 0
                                    ? "text-amber-400"
                                    : "text-slate-600"
                                }`}
                                title={
                                  a.target.cves > 0
                                    ? "มีจำนวน CVE แต่ยังไม่มี CVE-ID — กด SCAN เพื่อดึงรายการจริง"
                                    : undefined
                                }
                              >
                                {a.target.cves}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded border ${meta.border} ${meta.bg} px-2 py-0.5 text-[10px] font-bold ${meta.text}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
                              />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-slate-300">
                            {a.score}
                          </td>
                          <td className="px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
                            {a.remediation}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {agentMessage ? (
              <p className="mt-2 text-[10px] text-slate-600">{agentMessage}</p>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
