"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { SignalScan } from "@/components/hud/SignalScan";
import { usePersistentState } from "@/lib/usePersistentState";
import {
  bruteForceAction,
  analyzeHash,
  listTeamAgents,
  type TeamAgent,
  type HashAnalysis,
} from "./actions";

export type CrackingJobItem = {
  id: string;
  targetHash: string;
  algorithm: string;
  charset: string;
  maxLength: number;
  status: string;
  recoveredPassword: string | null;
  attempts: number;
  duration: number;
};

// Keyspace size per character in each allowed charset (must match usbScripts.ts).
const CHARSET_SIZE: Record<string, number> = {
  "lower+numbers": 36,
  "full-alpha": 62,
  symbols: 46,
};

type Level = 1 | 2 | 3 | 4;
const LEVEL_META: Record<Level, { label: string; cls: string }> = {
  1: { label: "LIGHT", cls: "light" },
  2: { label: "MODERATE", cls: "moderate" },
  3: { label: "HEAVY", cls: "heavy" },
  4: { label: "EXTREME", cls: "extreme" },
};

// Team Ops feed — role-tagged pipeline messages shown live during Full Auto.
type FeedRole = "COORDINATOR" | "PLANNER" | "CRACKER" | "VERIFIER";
type FeedMsg = { id: number; role: FeedRole; text: string; tone?: "ok" | "bad" | "warn"; ts: string };

// Glyph/colour + plain role label per pipeline role. The display NAME now comes
// from a real platform agent assigned to the role (see roleAgent); these labels
// are the fallback only when no agents are registered.
const ROLE_META: Record<FeedRole, { label: string; glyph: string; color: string }> = {
  COORDINATOR: { label: "ผู้ประสานทีม", glyph: "◆", color: "#c77dff" },
  PLANNER: { label: "วางแผน", glyph: "◈", color: "#4cc9f0" },
  CRACKER: { label: "ลงมือแครก", glyph: "▶", color: "#f72585" },
  VERIFIER: { label: "ตรวจสอบ", glyph: "✓", color: "#3ad29f" },
};

const ROLE_ORDER: FeedRole[] = ["COORDINATOR", "PLANNER", "CRACKER", "VERIFIER"];

// Demo hashes of the word "password" per algorithm — used when the hash field is
// left empty so the engine can be tried without typing anything (not required).
const DEMO_HASHES: Record<string, string> = {
  MD5: "5f4dcc3b5aa765d61d8327deb882cf99",
  SHA1: "5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8",
  SHA256: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
  SHA512:
    "b109f3bbbc244eb82441917ed06d618b9008dd09b3befd1b5e07394c706a8bb980b1d7785e5976ec049b46df5f1326af5a2ea6d103fd07c95385ffab0cacbc86",
};

// Full-auto escalation: try the smallest keyspace first, widen on a miss.
const AUTO_STRATEGY: { charset: string; name: string }[] = [
  { charset: "lower+numbers", name: "a-z · 0-9" },
  { charset: "full-alpha", name: "A-Z · a-z · 0-9" },
  { charset: "symbols", name: "+ สัญลักษณ์ !@#$" },
];

/** Total candidate passwords across lengths 1..maxLength for a given charset size. */
function keyspaceSize(charsetSize: number, maxLength: number): number {
  let total = 0;
  for (let len = 1; len <= maxLength; len++) total += charsetSize ** len;
  return total;
}

function classifyLevel(combinations: number): Level {
  if (combinations < 1e4) return 1;
  if (combinations < 2e6) return 2;
  if (combinations < 1e8) return 3;
  return 4;
}

function formatCombinations(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export function UsbLab() {
  // Inputs persist so a refresh keeps the operator's last configuration.
  const [targetHash, setTargetHash] = usePersistentState("usb:targetHash", "");
  const [algorithm, setAlgorithm] = usePersistentState("usb:algorithm", "SHA256");
  const [charset, setCharset] = usePersistentState("usb:charset", "lower+numbers");
  const [maxLength, setMaxLength] = usePersistentState("usb:maxLength", 4);

  const [cracking, setCracking] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Password Cracking Engine ready");
  // Cracking job history is durable — it must not vanish on refresh.
  const [history, setHistory] = usePersistentState<CrackingJobItem[]>(
    "usb:history",
    [],
  );
  const [selectedJob, setSelectedJob] = useState<CrackingJobItem | null>(null);

  // RECON — pre-crack weakness analysis (identify → dictionary → feasibility).
  const [analysis, setAnalysis] = useState<HashAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [autoRunning, setAutoRunning] = useState(false);
  const [feed, setFeed] = useState<FeedMsg[]>([]);
  const autoCancel = useRef(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const feedIdRef = useRef(0);

  // Real agents from the platform DB crew the team (no fabricated personas).
  const [teamAgents, setTeamAgents] = useState<TeamAgent[]>([]);
  useEffect(() => {
    let live = true;
    void listTeamAgents().then((a) => {
      if (live) setTeamAgents(a);
    });
    return () => {
      live = false;
    };
  }, []);

  // Assign real agents to the four pipeline roles (running agents first).
  const roleAgent = useMemo(() => {
    const map: Record<FeedRole, TeamAgent | null> = {
      COORDINATOR: null,
      PLANNER: null,
      CRACKER: null,
      VERIFIER: null,
    };
    if (teamAgents.length) {
      ROLE_ORDER.forEach((role, i) => {
        map[role] = teamAgents[i % teamAgents.length];
      });
    }
    return map;
  }, [teamAgents]);
  const hasTeam = teamAgents.length > 0;

  const pushFeed = (role: FeedRole, text: string, tone?: "ok" | "bad" | "warn") => {
    const id = ++feedIdRef.current;
    const ts = new Date().toLocaleTimeString("en-GB");
    setFeed((prev) => [...prev, { id, role, text, tone, ts }]);
  };

  // Keep the Team Ops feed scrolled to the newest line.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed]);

  // Estimated job load, purely from the chosen parameters — recomputed live as
  // the user adjusts charset/length, before the job is ever started.
  const { level, combinations } = useMemo(() => {
    const size = CHARSET_SIZE[charset] ?? 36;
    const combos = keyspaceSize(size, Math.max(1, Math.min(8, maxLength)));
    return { level: classifyLevel(combos), combinations: combos };
  }, [charset, maxLength]);
  const levelMeta = LEVEL_META[level];

  // Hash field is OPTIONAL — if empty, use a demo hash for the selected algorithm.
  const resolveHash = () =>
    targetHash.trim() || DEMO_HASHES[algorithm.toUpperCase()] || DEMO_HASHES.SHA256;

  // RECON only — identify the hash + dictionary + feasibility, no brute-force.
  async function runRecon(): Promise<HashAnalysis | null> {
    const cleanHash = resolveHash();
    setAnalyzing(true);
    try {
      const res = await analyzeHash(cleanHash, algorithm, charset, maxLength);
      setAnalysis(res);
      setStatusMsg(res.recommendation || res.output);
      return res;
    } catch {
      setStatusMsg("RECON ล้มเหลว");
      return null;
    } finally {
      setAnalyzing(false);
    }
  }

  async function startCrackingJob() {
    const cleanHash = resolveHash();

    setCracking(true);

    try {
      // 1) RECON ก่อน — identify + dictionary/rules (วิธีของมืออาชีพ: ไม่แครกมั่ว)
      setStatusMsg("RECON: วิเคราะห์ชนิด hash + ลอง dictionary ก่อน...");
      const recon = await analyzeHash(cleanHash, algorithm, charset, maxLength);
      setAnalysis(recon);
      if (recon.ok && recon.dictionary.found) {
        const job: CrackingJobItem = {
          id: `dict_${Date.now()}`,
          targetHash: cleanHash,
          algorithm,
          charset: "dictionary",
          maxLength,
          status: "SUCCESS",
          recoveredPassword: recon.dictionary.password,
          attempts: recon.dictionary.tested,
          duration: 0,
        };
        setHistory((prev) => [job, ...prev]);
        setSelectedJob(job);
        setStatusMsg(
          `[DICTIONARY] พบรหัสผ่านทันทีจาก wordlist: ${recon.dictionary.password} — รหัสอ่อนมาก ไม่ต้อง brute`,
        );
        return;
      }
      if (recon.ok && !recon.detected.matchesSelected && recon.detected.algorithms.length) {
        setStatusMsg(
          `⚠ อัลกอริทึมอาจไม่ตรง — hash นี้น่าจะเป็น ${recon.detected.algorithms.join("/")} (ที่เลือก: ${algorithm})`,
        );
      }

      // 2) ไม่พบใน dictionary → brute-force (ทางเลือกสุดท้าย)
      setStatusMsg(
        `RECON: ไม่พบใน dictionary → เริ่ม brute-force (${recon.keyspace.feasibility})...`,
      );
      const result = await bruteForceAction(cleanHash, algorithm, charset, maxLength);

      if (!result.ok) {
        throw new Error(result.output || "ไม่สามารถเริ่มกระบวนการแครกได้");
      }

      const matched = result.data?.find((r) => r.success);

      const newJob: CrackingJobItem = {
        id: `job_${Date.now()}`,
        targetHash: cleanHash,
        algorithm,
        charset,
        maxLength,
        status: result.found ? "SUCCESS" : "FAILED",
        recoveredPassword: matched?.password ?? null,
        attempts: matched?.attempts ?? 0,
        duration: matched?.duration ?? 0,
      };

      setHistory((prev) => [newJob, ...prev]);
      setSelectedJob(newJob);
      setStatusMsg(result.found ? `[SUCCESS] กู้คืนรหัสผ่านสำเร็จ: ${matched?.password}` : "ไม่พบรหัสผ่านที่ตรงกับค่าแฮชเป้าหมายในเงื่อนไขที่กำหนด");
    } catch (error: unknown) {
      setStatusMsg(`เกิดข้อผิดพลาด: ${(error as Error).message}`);
    } finally {
      setCracking(false);
    }
  }

  // Full Auto: a team of agents escalates the keyspace light -> heavy until the
  // hash is recovered, narrating each step in the Team Ops feed. Local only.
  async function startFullAuto() {
    const cleanHash = resolveHash();
    autoCancel.current = false;
    setAutoRunning(true);
    setFeed([]);
    setStatusMsg("Full Auto · ทีมเอเจนต์กำลังวางแผนและลงมือ...");
    pushFeed("COORDINATOR", `รับภารกิจ: กู้คืนรหัสผ่านจากแฮช ${algorithm} (ยาวสูงสุด ${maxLength}) · แบ่งงานให้ทีม`);
    pushFeed("PLANNER", `กลยุทธ์: RECON ก่อน → ไล่ชุดอักขระจากเบาไปหนัก ${AUTO_STRATEGY.length} ระดับ หยุดทันทีที่เจอ`);

    let found = false;

    // RECON phase — identify the hash + try dictionary/rules before brute.
    pushFeed("PLANNER", "RECON: ระบุชนิด hash + ลอง dictionary/rules ก่อน brute");
    const recon = await analyzeHash(cleanHash, algorithm, charset, maxLength);
    setAnalysis(recon);
    if (recon.ok) {
      pushFeed(
        "VERIFIER",
        `hash คาดว่าเป็น ${recon.detected.algorithms.join("/") || "ไม่ทราบ"} · ${recon.detected.matchesSelected ? "ตรงกับที่เลือก" : "อาจไม่ตรง!"}`,
        recon.detected.matchesSelected ? undefined : "warn",
      );
    }
    if (recon.ok && recon.dictionary.found) {
      const job: CrackingJobItem = {
        id: `dict_${Date.now()}`,
        targetHash: cleanHash,
        algorithm,
        charset: "dictionary",
        maxLength,
        status: "SUCCESS",
        recoveredPassword: recon.dictionary.password,
        attempts: recon.dictionary.tested,
        duration: 0,
      };
      setHistory((prev) => [job, ...prev]);
      setSelectedJob(job);
      pushFeed("CRACKER", `พบรหัสผ่านใน dictionary ทันที: ${recon.dictionary.password}`, "ok");
      pushFeed("COORDINATOR", "ภารกิจสำเร็จด้วย wordlist · ไม่ต้อง brute", "ok");
      setStatusMsg(`[DICTIONARY] Full Auto พบรหัสผ่าน: ${recon.dictionary.password}`);
      found = true;
    } else if (recon.ok) {
      pushFeed("CRACKER", "ไม่พบใน dictionary → เริ่ม brute-force escalation", "warn");
    }

    for (let i = 0; i < AUTO_STRATEGY.length; i++) {
      if (found) break;
      if (autoCancel.current) {
        pushFeed("COORDINATOR", "ยกเลิกภารกิจโดยผู้ควบคุม", "warn");
        break;
      }
      const step = AUTO_STRATEGY[i];
      const combos = keyspaceSize(CHARSET_SIZE[step.charset] ?? 36, Math.max(1, Math.min(8, maxLength)));
      pushFeed("PLANNER", `ระดับ ${i + 1}/${AUTO_STRATEGY.length}: ${step.name} · keyspace ~${formatCombinations(combos)} (${LEVEL_META[classifyLevel(combos)].label})`);
      pushFeed("CRACKER", `เริ่มสุ่มรหัสผ่านด้วย ${step.name}...`);
      setStatusMsg(`Full Auto · ระดับ ${i + 1}: ${step.name}`);

      let result: Awaited<ReturnType<typeof bruteForceAction>>;
      try {
        result = await bruteForceAction(cleanHash, algorithm, step.charset, maxLength);
      } catch (e) {
        pushFeed("CRACKER", `ข้อผิดพลาด: ${(e as Error).message}`, "bad");
        continue;
      }
      if (!result.ok) {
        pushFeed("CRACKER", result.output || "รันไม่สำเร็จ", "bad");
        continue;
      }
      const matched = result.data?.find((r) => r.success);
      const job: CrackingJobItem = {
        id: `auto_${Date.now()}_${i}`,
        targetHash: cleanHash,
        algorithm,
        charset: step.charset,
        maxLength,
        status: result.found ? "SUCCESS" : "FAILED",
        recoveredPassword: matched?.password ?? null,
        attempts: matched?.attempts ?? 0,
        duration: matched?.duration ?? 0,
      };
      setHistory((prev) => [job, ...prev]);

      if (result.found && matched) {
        pushFeed("CRACKER", `พบรหัสผ่าน! หลังทดสอบ ${matched.attempts.toLocaleString("en-US")} ครั้ง (${matched.duration.toFixed(2)}s)`, "ok");
        pushFeed("VERIFIER", `ยืนยัน: "${matched.password}" ตรงกับแฮชเป้าหมาย ✓`, "ok");
        pushFeed("COORDINATOR", "ภารกิจสำเร็จ · บันทึกผลลงประวัติแล้ว", "ok");
        setSelectedJob(job);
        setStatusMsg(`[SUCCESS] Full Auto กู้คืนรหัสผ่าน: ${matched.password}`);
        found = true;
        break;
      }
      pushFeed("CRACKER", `ไม่พบในระดับนี้ (ทดสอบ ${job.attempts.toLocaleString("en-US")} ครั้ง)`, "warn");
      pushFeed("VERIFIER", "ไม่ตรง · ส่งต่อให้วางแผนระดับถัดไป", "warn");
    }

    if (!found && !autoCancel.current) {
      pushFeed("COORDINATOR", "จบทุกระดับแล้วยังไม่พบ · แนะนำเพิ่มความยาว หรือใช้ dictionary", "warn");
      setStatusMsg("Full Auto เสร็จสิ้น · ไม่พบรหัสผ่านในกลยุทธ์ปัจจุบัน");
    }
    setAutoRunning(false);
  }

  function stopAuto() {
    autoCancel.current = true;
    setStatusMsg("กำลังยกเลิก Full Auto...");
  }

  const busy = cracking || autoRunning;
  const maxAttempts = Math.max(1, ...history.map((j) => j.attempts));

  return (
    <>
      {/* ส่วนควบคุมหลัก: Password Cracking & Hash Decryption Control Panel */}
      <section className="panel span-12" id="usb-scan">
        <header className="panel-head">
          <span>01 // Password Cracking & Hash Decryption Engine</span>
          <em>{cracking ? "กำลังประมวลผล..." : "พร้อมใช้งาน"}</em>
        </header>

        <p className="notice">
          ระบบเครื่องมือทางไซเบอร์เพื่อสุ่มรหัสผ่าน ถอดรหัสแฮช และตรวจสอบความปลอดภัยเชิงรุก (Brute-force / Dictionary Recovery Utility) — ประมวลผลในเครื่องนี้เท่านั้น ไม่มีการเชื่อมต่อออกไปยังเป้าหมายภายนอก
        </p>

        {/* ฟอร์มตั้งค่าพารามิเตอร์การแครก */}
        <div className="usb-config">
          <label className="field">
            <span>TARGET HASH / ENCRYPTED STRING</span>
            <input
              type="text"
              placeholder="วางค่าแฮชเป้าหมายที่ต้องการแครกที่นี่ (เช่น MD5, SHA256)..."
              value={targetHash}
              onChange={(e) => setTargetHash(e.target.value)}
            />
          </label>

          <div className="usb-config-grid">
            <label className="field">
              <span>ALGORITHM</span>
              <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)}>
                <option value="MD5">MD5</option>
                <option value="SHA1">SHA1</option>
                <option value="SHA256">SHA256</option>
                <option value="SHA512">SHA512</option>
              </select>
            </label>

            <label className="field">
              <span>CHARACTER SET</span>
              <select value={charset} onChange={(e) => setCharset(e.target.value)}>
                <option value="lower+numbers">Lowercase + Numbers (a-z, 0-9)</option>
                <option value="full-alpha">Full Alphanumeric (A-Z, a-z, 0-9)</option>
                <option value="symbols">Include Symbols (!@#$)</option>
              </select>
            </label>

            <label className="field">
              <span>MAX LENGTH</span>
              <input
                type="number"
                value={maxLength}
                onChange={(e) => setMaxLength(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                min={1}
                max={8}
              />
            </label>
          </div>

          <div className="usb-run-row">
            {/* มาตรวัดภาระงาน: คำนวณสดจากชุดตัวอักษร/ความยาว ก่อนเริ่มงานจริง */}
            <div className="usb-meter" title={`${combinations.toLocaleString("en-US")} combinations`}>
              <div className={`usb-meter-top lv-${levelMeta.cls}`}>
                <b>JOB LOAD · {levelMeta.label}</b>
                <span>~{formatCombinations(combinations)} combos</span>
              </div>
              <div className="usb-meter-track">
                {([1, 2, 3, 4] as Level[]).map((seg) => (
                  <i key={seg} className={`usb-meter-seg ${seg <= level ? `on-${levelMeta.cls}` : ""}`} />
                ))}
              </div>
            </div>

            <div className="usb-run-actions">
              <button
                type="button"
                className="btn btn-ghost usb-recon-btn"
                disabled={busy || analyzing}
                onClick={() => void runRecon()}
                title="สแกนหาจุดอ่อนก่อนแครก: ระบุชนิด hash + ลอง dictionary/rules + ประเมินความเป็นไปได้"
              >
                <Icon name="search" />
                {analyzing ? "กำลังวิเคราะห์..." : "RECON หาจุดอ่อน"}
              </button>

              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={startCrackingJob}
              >
                <Icon name="refresh" />
                {cracking ? "กำลังแครก..." : "แครก (RECON→Dictionary→Brute)"}
              </button>

              <button
                type="button"
                className="btn btn-ok usb-auto-btn"
                disabled={busy}
                onClick={startFullAuto}
                title="ให้ทีมเอเจนต์วางแผนและไล่สุ่มอัตโนมัติจนเจอ"
              >
                ⚡ {autoRunning ? "ทีมกำลังทำงาน..." : "Full Auto (ทีมเอเจนต์)"}
              </button>

              {autoRunning && (
                <button type="button" className="btn btn-ghost" onClick={stopAuto}>
                  ■ หยุด
                </button>
              )}
            </div>
          </div>
        </div>

        {busy ? (
          <SignalScan label={autoRunning ? "FULL AUTO · TEAM ENGINE RUNNING" : "EXECUTING PASSWORD CRACKING ENGINE"} note={statusMsg} level={level} />
        ) : (
          <p className="usb-msg">{statusMsg}</p>
        )}

        {analysis && analysis.ok && (
          <div className="usb-recon">
            <div className="usb-recon-head">
              <span>RECON · การวิเคราะห์จุดอ่อนก่อนแครก</span>
              <span className={`usb-recon-feasible f-${analysis.keyspace.feasibility}`}>
                {analysis.keyspace.feasibility.toUpperCase()}
              </span>
            </div>
            <div className="usb-recon-grid">
              <div>
                <small>ชนิด hash (คาดการณ์)</small>
                <b>{analysis.detected.algorithms.join(" / ") || "ไม่ทราบ"}</b>
              </div>
              <div>
                <small>อัลกอริทึมที่เลือก</small>
                <b className={analysis.detected.matchesSelected ? "" : "usb-recon-warn"}>
                  {algorithm} {analysis.detected.matchesSelected ? "✓" : "⚠ อาจไม่ตรง"}
                </b>
              </div>
              <div>
                <small>Dictionary / Rules</small>
                <b className={analysis.dictionary.found ? "usb-recon-hit" : ""}>
                  {analysis.dictionary.found
                    ? `พบ → ${analysis.dictionary.password}`
                    : `ไม่พบ (ลอง ${analysis.dictionary.tested.toLocaleString("en-US")})`}
                </b>
              </div>
              <div>
                <small>Keyspace brute</small>
                <b>~{analysis.keyspace.combos.toLocaleString("en-US")}</b>
              </div>
            </div>
            <p className="usb-recon-rec">▸ {analysis.recommendation}</p>
          </div>
        )}

        {/* กราฟสรุปจำนวนครั้งที่ทดสอบของแต่ละงาน (ล่าสุดอยู่ซ้าย) */}
        <div className="usb-chart-axis">
          <span>JOB ATTEMPTS — LATEST {Math.min(history.length, 24) || ""}</span>
          <span>{history.length > 0 ? `max ${maxAttempts.toLocaleString("en-US")}` : ""}</span>
        </div>
        {history.length === 0 ? (
          <p className="usb-chart-empty">ยังไม่มีประวัติการทดสอบ — กราฟจะแสดงหลังรันงานครั้งแรก</p>
        ) : (
          <div className="usb-chart">
            {history.slice(0, 24).reverse().map((job) => (
              <i
                key={job.id}
                className={`usb-chart-bar ${job.status !== "SUCCESS" ? "fail" : ""}`}
                style={{ height: `${Math.max(6, (job.attempts / maxAttempts) * 100)}%` }}
                title={`${job.id} · ${job.attempts.toLocaleString("en-US")} attempts · ${job.duration.toFixed(2)}s`}
                onClick={() => setSelectedJob(job)}
              />
            ))}
          </div>
        )}

        {/* ตารางแสดงประวัติผลการแครก (Cracking Job History) */}
        {history.length > 0 && (
          <div className="table-scroll">
            <table className="grid-table usb-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Target Hash</th>
                  <th>Algorithm</th>
                  <th>Status</th>
                  <th>Recovered Password</th>
                  <th>Attempts</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {history.map((job) => (
                  <tr
                    key={job.id}
                    className={selectedJob?.id === job.id ? "is-sel" : ""}
                    onClick={() => setSelectedJob(job)}
                  >
                    <td className="usb-name">{job.id}</td>
                    <td className="usb-vid" style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {job.targetHash}
                    </td>
                    <td>{job.algorithm}</td>
                    <td>
                      {job.status === "SUCCESS" ? (
                        <span className="usb-ok">● SUCCESS</span>
                      ) : (
                        <span className="usb-bad">● FAILED</span>
                      )}
                    </td>
                    <td className="usb-busid">{job.recoveredPassword || "—"}</td>
                    <td>{job.attempts.toLocaleString("en-US")}</td>
                    <td className="muted">{job.duration.toFixed(2)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="hint">
          ระบบประมวลผลการแครกรหัสผ่านและตรวจสอบค่าแฮชเชิงโครงสร้าง · พร้อมเก็บบันทึกประวัติการทดสอบ
        </p>
      </section>

      {/* Team Ops Feed — live agent planning & coordination during Full Auto */}
      <section className="panel span-12 usb-feed-panel" id="usb-feed">
        <header className="panel-head">
          <span>01b // TEAM OPS — บทสนทนา &amp; การวางแผนของเอเจนต์</span>
          <em className={autoRunning ? "usb-feed-live" : ""}>
            {autoRunning ? "● LIVE" : feed.length ? "IDLE" : "STANDBY"}
          </em>
        </header>
        <div className="usb-roster">
          {hasTeam ? (
            ROLE_ORDER.map((role) => {
              const a = roleAgent[role];
              const r = ROLE_META[role];
              return (
                <div key={role} className="usb-roster-item">
                  <span className="usb-roster-glyph" style={{ color: r.color, borderColor: r.color }}>
                    {r.glyph}
                  </span>
                  <div className="usb-roster-id">
                    <b>{a?.name ?? "—"}</b>
                    <small>
                      {r.label} ·{" "}
                      <span className={`usb-roster-st s-${a?.status ?? "idle"}`}>
                        {a?.status ?? "idle"}
                      </span>
                    </small>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="usb-roster-empty">
              ยังไม่มีเอเจนต์ในระบบ — ไปลงทะเบียนที่{" "}
              <Link href="/agents">หน้า Agents</Link>{" "}
              เพื่อให้ทีมจริงเข้าปฏิบัติการ (Full Auto ยังรัน engine จริงได้ แต่ feed จะแสดงเป็นชื่อ role)
            </p>
          )}
        </div>
        <div className="usb-feed" ref={feedRef}>
          {feed.length === 0 ? (
            <p className="usb-feed-empty">
              กด <b>Full Auto (ทีมเอเจนต์)</b> เพื่อให้ทีมวางแผนและไล่สุ่มอัตโนมัติ — บทสนทนา/การตัดสินใจจะแสดงที่นี่แบบเรียลไทม์
            </p>
          ) : (
            feed.map((m) => {
              const r = ROLE_META[m.role];
              const agent = roleAgent[m.role];
              const displayName = agent ? agent.name : m.role;
              return (
                <div key={m.id} className={`usb-feed-row tone-${m.tone ?? "none"}`}>
                  <span className="usb-feed-ava" style={{ color: r.color, borderColor: r.color }}>{r.glyph}</span>
                  <div className="usb-feed-body">
                    <div className="usb-feed-meta">
                      <b style={{ color: r.color }}>{displayName}</b>
                      <span className="usb-feed-role">· {r.label}</span>
                      <time>{m.ts}</time>
                    </div>
                    <p>{m.text}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ส่วนแสดงรายละเอียดงานแครกที่เลือก (Selected Cracking Job Detail) */}
      {selectedJob && (
        <section className="panel span-12" id="usb-detail">
          <header className="panel-head">
            <span>02 // รายละเอียดผลลัพธ์การแครก · {selectedJob.id}</span>
            <em>{selectedJob.algorithm}</em>
          </header>

          <div className="usb-idrow">
            <code className="usb-idval">Target: {selectedJob.targetHash}</code>
          </div>

          <div className="usb-result">
            <p className="usb-result-lead">&gt; สถานะการกู้คืนรหัสผ่าน:</p>
            <p className={`usb-result-value ${selectedJob.recoveredPassword ? "hit" : "miss"}`}>
              {selectedJob.recoveredPassword ? `รหัสผ่านที่ถอดได้: [ ${selectedJob.recoveredPassword} ]` : "ไม่พบรหัสผ่านในเงื่อนไขการค้นหาปัจจุบัน"}
            </p>
            <div className="usb-result-kv">
              <div>จำนวนครั้งที่ทดสอบ (Attempts): <strong>{selectedJob.attempts.toLocaleString("en-US")}</strong></div>
              <div>เวลาที่ใช้ประมวลผล (Duration): <strong>{selectedJob.duration.toFixed(2)} วินาที</strong></div>
              <div>รูปแบบชุดตัวอักษร (Charset): <strong>{selectedJob.charset}</strong></div>
              <div>ความยาวสูงสุด (Max Length): <strong>{selectedJob.maxLength}</strong></div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
