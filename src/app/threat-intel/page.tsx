"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  ExternalLink,
  Radar,
  ShieldAlert,
  X,
} from "lucide-react";

import { Navbar } from "@/components/hud/Navbar";
import { Sidebar } from "@/components/hud/Sidebar";

import { scanIpsForVulns } from "@/app/takeover/scan-actions";
import {
  enrichCves,
  getCveDetail,
  getEnvironmentCves,
  getRadarBatch,
  type CveDetail,
  type EnvCve,
} from "./actions";

// Services whose exposure makes any attached CVE a "severe" finding.
const CRITICAL_SVC = new Set([
  "mysql",
  "postgres",
  "postgresql",
  "mssql",
  "ms-sql-s",
  "mongodb",
  "mongo",
  "redis",
  "elasticsearch",
  "memcached",
  "rdp",
  "ms-wbt-server",
  "vnc",
  "smb",
  "microsoft-ds",
  "telnet",
  "ldap",
  "nfs",
]);

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

// Real NVD severity when the CVE is enriched; otherwise a provisional estimate
// from service exposure (shown as "~" in the UI) until NVD confirms it.
function severityOf(cve: EnvCve): Severity {
  if (cve.enriched && cve.nvdSeverity) {
    return cve.nvdSeverity === "NONE" ? "INFO" : cve.nvdSeverity;
  }
  const hasCritical = cve.services.some((s) =>
    CRITICAL_SVC.has(s.toLowerCase()),
  );
  if (hasCritical) return "CRITICAL";
  if (cve.assets >= 5) return "HIGH";
  return "MEDIUM";
}

const SEV_META: Record<
  Severity,
  { label: string; text: string; bg: string; border: string; dot: string }
> = {
  CRITICAL: {
    label: "CRITICAL",
    text: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    dot: "bg-red-400",
  },
  HIGH: {
    label: "HIGH",
    text: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/40",
    dot: "bg-orange-400",
  },
  MEDIUM: {
    label: "MEDIUM",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    dot: "bg-amber-400",
  },
  LOW: {
    label: "LOW",
    text: "text-sky-300",
    bg: "bg-sky-500/10",
    border: "border-sky-500/40",
    dot: "bg-sky-400",
  },
  INFO: {
    label: "INFO",
    text: "text-slate-300",
    bg: "bg-slate-500/10",
    border: "border-slate-500/30",
    dot: "bg-slate-400",
  },
};

type Alert = {
  id: string;
  cve: string;
  severity: Severity;
  assets: number;
  services: string[];
  time: string;
};

const INTERVALS = [
  { label: "10 วิ", ms: 10000 },
  { label: "20 วิ", ms: 20000 },
  { label: "45 วิ", ms: 45000 },
  { label: "90 วิ", ms: 90000 },
];

export default function ThreatIntelPage() {
  const [cves, setCves] = useState<EnvCve[]>([]);
  const [stats, setStats] = useState({
    totalCves: 0,
    affected: 0,
    critical: 0,
    enriched: 0,
  });
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);

  const [radarOn, setRadarOn] = useState(false);
  const [intervalMs, setIntervalMs] = useState(20000);
  const [scanning, setScanning] = useState(false);
  const [lastTick, setLastTick] = useState<string>("—");
  const [sweeps, setSweeps] = useState(0);
  // Per-sweep count of newly discovered CVEs — drives the activity sparkline.
  const [history, setHistory] = useState<number[]>([]);
  const [blips, setBlips] = useState(0);

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [detail, setDetail] = useState<{
    cve: string;
    loading: boolean;
    data: CveDetail | null;
  } | null>(null);

  const seenRef = useRef<Set<string>>(new Set());
  const alertedRef = useRef<Set<string>>(new Set());
  const radarRef = useRef(false);
  const tickingRef = useRef(false);

  const applyCves = useCallback((list: EnvCve[]) => {
    setCves(list);
    setStats({
      totalCves: list.length,
      affected: list.reduce((m, c) => Math.max(m, c.assets), 0),
      // Count only NVD-confirmed CRITICAL to avoid heuristic over-counting.
      critical: list.filter((c) => c.enriched && c.nvdSeverity === "CRITICAL")
        .length,
      enriched: list.filter((c) => c.enriched).length,
    });
  }, []);

  const loadCves = useCallback(
    async (seedSeen: boolean) => {
      const res = await getEnvironmentCves();
      if (!res.ok) {
        setMessage(res.message);
        return [];
      }
      setMessage("");
      applyCves(res.cves);
      if (seedSeen) {
        seenRef.current = new Set(res.cves.map((c) => c.cve));
      }
      return res.cves;
    },
    [applyCves],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadCves(true);
      setLoading(false);
    })();
  }, [loadCves]);

  const pushAlert = useCallback((cve: EnvCve) => {
    const sev = severityOf(cve);
    setAlerts((prev) => {
      if (prev.some((a) => a.cve === cve.cve)) return prev;
      return [
        {
          id: `${cve.cve}-${Date.now()}`,
          cve: cve.cve,
          severity: sev,
          assets: cve.assets,
          services: cve.services,
          time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        },
        ...prev,
      ].slice(0, 60);
    });
  }, []);

  // Raise alerts only for NVD-confirmed severe CVEs (CRITICAL/HIGH).
  const raiseAlerts = useCallback(
    (list: EnvCve[]) => {
      for (const c of list) {
        if (!c.enriched || !c.nvdSeverity) continue;
        if (c.nvdSeverity !== "CRITICAL" && c.nvdSeverity !== "HIGH") continue;
        if (alertedRef.current.has(c.cve)) continue;
        alertedRef.current.add(c.cve);
        pushAlert(c);
      }
    },
    [pushAlert],
  );

  // One radar sweep: scan targets → enrich new CVEs from NVD → refresh → alert.
  const tick = useCallback(async () => {
    if (tickingRef.current) return;
    tickingRef.current = true;
    setScanning(true);
    try {
      const batch = await getRadarBatch(12);
      if (batch.ok && batch.ips.length) {
        await scanIpsForVulns(batch.ips);
      }
      let list = await loadCves(false);

      // Count newly discovered CVEs this sweep (for the activity graph).
      let found = 0;
      for (const c of list) {
        if (!seenRef.current.has(c.cve)) {
          seenRef.current.add(c.cve);
          found++;
        }
      }

      // Enrich any un-enriched CVEs from NVD (throttled server-side).
      const pending = list.filter((c) => !c.enriched).map((c) => c.cve);
      if (pending.length) {
        setEnriching(true);
        await enrichCves(pending, 6);
        setEnriching(false);
        list = await loadCves(false);
      }

      raiseAlerts(list);
      setHistory((h) => [...h, found].slice(-28));
      setBlips(batch.ok ? batch.ips.length : 0);
      setLastTick(new Date().toLocaleTimeString("en-GB", { hour12: false }));
      setSweeps((n) => n + 1);
    } finally {
      setScanning(false);
      setEnriching(false);
      tickingRef.current = false;
    }
  }, [loadCves, raiseAlerts]);

  // Manual one-shot: enrich everything still missing CVSS, in batches.
  const enrichAll = useCallback(async () => {
    if (enriching) return;
    setEnriching(true);
    try {
      let guard = 0;
      // Loop a few batches; each respects NVD rate limits server-side.
      while (guard++ < 12) {
        const list = await loadCves(false);
        const pending = list.filter((c) => !c.enriched).map((c) => c.cve);
        if (!pending.length) break;
        const r = await enrichCves(pending, 6);
        await loadCves(false);
        if (r.rateLimited) break;
        if (r.fetched === 0) break;
      }
      raiseAlerts(await loadCves(false));
    } finally {
      setEnriching(false);
    }
  }, [enriching, loadCves, raiseAlerts]);

  // Radar loop.
  useEffect(() => {
    radarRef.current = radarOn;
    if (!radarOn) return;
    let stopped = false;
    const run = async () => {
      if (stopped || !radarRef.current) return;
      await tick();
    };
    void run();
    const id = window.setInterval(() => void run(), intervalMs);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [radarOn, intervalMs, tick]);

  function startRadar() {
    // Surface already-confirmed severe CVEs immediately, then sweep.
    raiseAlerts(cves);
    setRadarOn(true);
  }

  async function openDetail(cve: string) {
    setDetail({ cve, loading: true, data: null });
    const data = await getCveDetail(cve);
    setDetail({ cve, loading: false, data });
  }

  const online = !message;

  return (
    <div className="shell" style={{ background: "#090a0f" }}>
      <Sidebar online={online} />

      {/* ── Alert dock (persistent, scrollable) ─────────────── */}
      <AlertDock
        alerts={alerts}
        onOpen={openDetail}
        onDismiss={(id) => setAlerts((p) => p.filter((a) => a.id !== id))}
        onClear={() => setAlerts([])}
      />

      <div className="takeover-page main flex min-w-0 flex-col bg-[#090a0f] text-slate-100">
        <Navbar online={online} title="THREAT INTEL" link="FEED" />

        <main className="flex-1 space-y-4 p-4 md:p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Radar className="h-5 w-5 text-cyan-400" />
                <h1 className="text-lg font-bold tracking-widest text-white">
                  THREAT INTEL FEED
                </h1>
              </div>
              <p className="mt-1 text-[10px] tracking-wider text-slate-500">
                FLEET CVE AGGREGATION · AUTO RADAR · LIVE ALERTING
              </p>
            </div>
          </header>

          {/* ── Radar command panel (wide) ──────────────────── */}
          <RadarPanel
            radarOn={radarOn}
            scanning={scanning}
            sweeps={sweeps}
            lastTick={lastTick}
            blips={blips}
            history={history}
            intervalMs={intervalMs}
            critical={stats.critical}
            alerts={alerts.length}
            onInterval={setIntervalMs}
            onStart={startRadar}
            onStop={() => setRadarOn(false)}
          />

          {message ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
              {message}
            </div>
          ) : null}

          {/* KPIs */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="CVE ในระบบ" value={stats.totalCves} tone="cyan" />
            <Kpi label="ระดับ CRITICAL" value={stats.critical} tone="red" />
            <Kpi
              label="ALERT ค้างอยู่"
              value={alerts.length}
              tone="amber"
            />
            <Kpi
              label="เรดาร์สแกนรอบ"
              value={sweeps}
              tone="green"
            />
          </section>

          {/* CVE table */}
          <section className="rounded border border-[#303649] bg-[#0e1017] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-slate-400" />
                <h2 className="text-xs font-bold tracking-widest text-white">
                  CVE ที่พบในระบบ (เรียงตาม CVSS จริงจาก NVD)
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">
                  enrich แล้ว{" "}
                  <b className="text-cyan-300">{stats.enriched}</b>/
                  {stats.totalCves}
                </span>
                <button
                  type="button"
                  onClick={() => void enrichAll()}
                  disabled={enriching || stats.enriched >= stats.totalCves}
                  className="rounded border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-wider text-cyan-300 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {enriching ? "กำลัง enrich..." : "ENRICH จาก NVD"}
                </button>
              </div>
            </div>

            <div className="max-h-[560px] overflow-auto rounded border border-[#1c2130]">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[#0b0d14]">
                  <tr className="text-[9px] font-bold tracking-widest text-slate-500">
                    <th className="px-3 py-2.5">CVE</th>
                    <th className="px-3 py-2.5">SEVERITY</th>
                    <th className="px-3 py-2.5 text-center">CVSS</th>
                    <th className="px-3 py-2.5 text-center">ASSETS</th>
                    <th className="px-3 py-2.5">SERVICES</th>
                    <th className="px-3 py-2.5">PORTS</th>
                    <th className="px-3 py-2.5">พบล่าสุด</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {cves.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                        {loading
                          ? "กำลังโหลด..."
                          : "ยังไม่พบ CVE — เริ่มเรดาร์เพื่อสแกนหาช่องโหว่"}
                      </td>
                    </tr>
                  ) : (
                    cves.slice(0, 500).map((c) => {
                      const sev = severityOf(c);
                      const meta = SEV_META[sev];
                      return (
                        <tr
                          key={c.cve}
                          className="border-t border-[#161b28] align-top hover:bg-[#11141d]"
                        >
                          <td className="px-3 py-2.5 font-mono text-cyan-300">
                            {c.cve}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded border ${meta.border} ${meta.bg} px-2 py-0.5 text-[10px] font-bold ${meta.text}`}
                              title={
                                c.enriched
                                  ? "ยืนยันจาก NVD CVSS"
                                  : "ประเมินเบื้องต้น (ยังไม่ enrich จาก NVD)"
                              }
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                              {c.enriched ? "" : "~"}
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono">
                            {c.cvss != null ? (
                              <span className={meta.text}>{c.cvss.toFixed(1)}</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-slate-200">
                            {c.assets}
                          </td>
                          <td className="px-3 py-2.5 text-slate-300">
                            {c.services.slice(0, 4).join(", ") || "—"}
                            {c.services.length > 4 ? ` +${c.services.length - 4}` : ""}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-400">
                            {c.ports.slice(0, 6).join(", ") || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-[10px] text-slate-500">
                            {c.lastSeen
                              ? new Date(c.lastSeen).toLocaleString("en-GB", {
                                  hour12: false,
                                })
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => void openDetail(c.cve)}
                              className="rounded border border-[#303649] px-2 py-1 text-[10px] text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300"
                            >
                              รายละเอียด
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {detail ? (
        <CveDetailModal
          state={detail}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}

function RadarPanel({
  radarOn,
  scanning,
  sweeps,
  lastTick,
  blips,
  history,
  intervalMs,
  critical,
  alerts,
  onInterval,
  onStart,
  onStop,
}: {
  radarOn: boolean;
  scanning: boolean;
  sweeps: number;
  lastTick: string;
  blips: number;
  history: number[];
  intervalMs: number;
  critical: number;
  alerts: number;
  onInterval: (ms: number) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const statusClass = radarOn
    ? scanning
      ? "ti-rp-scanning"
      : "ti-rp-active"
    : "ti-rp-idle";
  const statusLabel = radarOn
    ? scanning
      ? "SCANNING"
      : "ACTIVE"
    : "IDLE";

  const max = Math.max(1, ...history);

  return (
    <section className={`panel span-12 ti-rp ${statusClass}`}>
      <div className="ti-rp-grid">
        {/* Radar scope */}
        <div className="ti-rp-scope-wrap">
          <div className={`ti-rp-scope ${radarOn ? "is-on" : ""}`}>
            <span className="ti-rp-ring r1" />
            <span className="ti-rp-ring r2" />
            <span className="ti-rp-ring r3" />
            <span className="ti-rp-cross ti-rp-cross-h" />
            <span className="ti-rp-cross ti-rp-cross-v" />
            {radarOn ? <span className="ti-rp-sweep" /> : null}
            <span className="ti-rp-core" />
            {radarOn
              ? [0, 1, 2, 3].map((i) => (
                  <span key={i} className={`ti-rp-blip b${i}`} />
                ))
              : null}
          </div>
        </div>

        {/* Status + controls */}
        <div className="ti-rp-main">
          <div className="ti-rp-statusline">
            <span className={`ti-rp-light ${statusClass}`} />
            <div>
              <div className="ti-rp-status">RADAR {statusLabel}</div>
              <div className="ti-rp-sub">
                sweep #{sweeps} · {lastTick} · {blips} เป้าหมาย/รอบ
              </div>
            </div>
          </div>

          {/* Activity sparkline */}
          <div className="ti-rp-chart" title="CVE ใหม่ที่พบต่อรอบสแกน">
            <div className="ti-rp-chart-label">กิจกรรมการสแกน (CVE ใหม่/รอบ)</div>
            <div className="ti-rp-bars">
              {history.length === 0 ? (
                <span className="ti-rp-bars-empty">— ยังไม่มีข้อมูล —</span>
              ) : (
                history.map((v, i) => (
                  <span
                    key={i}
                    className={`ti-rp-bar ${v > 0 ? "hit" : ""}`}
                    style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
                    title={`รอบ ${i + 1}: ${v} CVE`}
                  />
                ))
              )}
            </div>
          </div>

          <div className="ti-rp-mini">
            <div className="ti-rp-minibox">
              <span className="ti-rp-mk">CRITICAL</span>
              <span className="ti-rp-mv ti-red">{critical}</span>
            </div>
            <div className="ti-rp-minibox">
              <span className="ti-rp-mk">ALERTS</span>
              <span className="ti-rp-mv ti-amber">{alerts}</span>
            </div>
            <div className="ti-rp-minibox">
              <span className="ti-rp-mk">SWEEPS</span>
              <span className="ti-rp-mv ti-cyan">{sweeps}</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="ti-rp-ctl">
          <label className="ti-rp-intlabel">ความถี่สแกน</label>
          <select
            value={intervalMs}
            onChange={(e) => onInterval(Number(e.target.value))}
            className="ti-rp-select"
          >
            {INTERVALS.map((i) => (
              <option key={i.ms} value={i.ms}>
                ทุก {i.label}
              </option>
            ))}
          </select>

          {radarOn ? (
            <button type="button" onClick={onStop} className="ti-rp-btn ti-rp-stop">
              ■ หยุดเรดาร์
            </button>
          ) : (
            <button type="button" onClick={onStart} className="ti-rp-btn ti-rp-start">
              <Radar className="h-4 w-4" /> เริ่มเรดาร์
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "red" | "amber" | "green";
}) {
  const color =
    tone === "cyan"
      ? "text-cyan-400"
      : tone === "red"
        ? "text-red-400"
        : tone === "amber"
          ? "text-amber-400"
          : "text-emerald-400";
  return (
    <div className="rounded border border-[#252b3b] bg-[#0e1017] p-3">
      <div className="text-[9px] font-bold tracking-widest text-slate-500">
        {label}
      </div>
      <div className={`mt-1 font-mono text-2xl font-bold ${color}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function AlertDock({
  alerts,
  onOpen,
  onDismiss,
  onClear,
}: {
  alerts: Alert[];
  onOpen: (cve: string) => void;
  onDismiss: (id: string) => void;
  onClear: () => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <div className="ti-dock">
      <div className="ti-dock-head">
        <span className="ti-dock-title">
          <Bell className="h-3.5 w-3.5" />
          แจ้งเตือนช่องโหว่ ({alerts.length})
        </span>
        <button type="button" onClick={onClear} className="ti-dock-clear">
          ล้างทั้งหมด
        </button>
      </div>
      <div className="ti-dock-list">
        {alerts.map((a) => {
          const meta = SEV_META[a.severity];
          return (
            <div key={a.id} className={`ti-card ${meta.border} ${meta.bg}`}>
              <button
                type="button"
                className="ti-card-x"
                onClick={() => onDismiss(a.id)}
                aria-label="ปิด"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="ti-card-top">
                <AlertTriangle className={`h-3.5 w-3.5 ${meta.text}`} />
                <span className={`ti-card-sev ${meta.text}`}>{meta.label}</span>
                <span className="ti-card-time">{a.time}</span>
              </div>
              <div className="ti-card-cve">{a.cve}</div>
              <div className="ti-card-meta">
                {a.assets} asset · {a.services.slice(0, 3).join(", ") || "—"}
              </div>
              <button
                type="button"
                className="ti-card-btn"
                onClick={() => onOpen(a.cve)}
              >
                ดูรายละเอียด →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CveDetailModal({
  state,
  onClose,
}: {
  state: { cve: string; loading: boolean; data: CveDetail | null };
  onClose: () => void;
}) {
  const d = state.data;
  return (
    <div className="ti-modal-backdrop" onClick={onClose}>
      <div className="ti-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ti-modal-head">
          <span className="ti-modal-cve">{state.cve}</span>
          <button type="button" onClick={onClose} className="ti-modal-x">
            <X className="h-4 w-4" />
          </button>
        </div>

        {state.loading ? (
          <p className="ti-modal-loading">กำลังดึงข้อมูลจาก NVD...</p>
        ) : d && d.ok ? (
          <div className="ti-modal-body">
            <div className="ti-modal-metrics">
              <div>
                <span className="ti-modal-k">CVSS</span>
                <span className="ti-modal-v">
                  {d.cvss != null ? d.cvss.toFixed(1) : "N/A"}
                </span>
              </div>
              <div>
                <span className="ti-modal-k">SEVERITY</span>
                <span className="ti-modal-v">{d.severity ?? "N/A"}</span>
              </div>
              <div>
                <span className="ti-modal-k">PUBLISHED</span>
                <span className="ti-modal-v">
                  {d.published ? d.published.slice(0, 10) : "N/A"}
                </span>
              </div>
            </div>
            {d.vector ? (
              <p className="ti-modal-vector">{d.vector}</p>
            ) : null}
            <p className="ti-modal-desc">{d.description}</p>
            <a
              className="ti-modal-link"
              href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(state.cve)}`}
              target="_blank"
              rel="noreferrer"
            >
              เปิดใน NVD <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : (
          <div className="ti-modal-body">
            <p className="ti-modal-err">{d?.message ?? "ไม่พบข้อมูล"}</p>
            <a
              className="ti-modal-link"
              href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(state.cve)}`}
              target="_blank"
              rel="noreferrer"
            >
              ลองเปิดใน NVD <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
