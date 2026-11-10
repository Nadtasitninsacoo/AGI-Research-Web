// Agent-facing wrappers around DARK AGI's nmap os-fingerprint and script-scan
// (NSE) operations: os_fingerprint, nse_scan, get_scan_job.
//
// Deliberately NOT routed through the generic MCP passthrough
// (listDarkAgiTools/callDarkAgiTool in darkAgi.mjs, which forwards any
// `toolId__operationId` call as-is). These three get their own local tools
// so we can:
//   1. validate targets/scripts/maxRate on our side before ever spending a
//      job submission (see nmapGuard.mjs),
//   2. warn (never auto-create) when no DARK AGI Scope covers a target,
//   3. return the jobId immediately without blocking on approval or result,
//   4. normalize + persist a finished job's hosts/OS/script output into our
//      own database once the agent asks for its status.
//
// DARK AGI's own scope check, approval gate and audit log still apply
// unchanged server-side — nothing here bypasses them; this is an extra,
// client-side layer in front of an already-gated platform.
import { execute } from "./db.mjs";
import { log } from "./logger.mjs";
import { config } from "./config.mjs";
import * as darkAgi from "./darkAgi.mjs";
import { validateNseScripts, validateTargets, clampMaxRate, targetsWithinScopes } from "./nmapGuard.mjs";

const OS_FINGERPRINT_TIMEOUT_MS = 30 * 60_000;
const SCRIPT_SCAN_TIMEOUT_MS = 60 * 60_000;

// Real implementations, used unless a test overrides one via ctx.deps — kept
// as one object (rather than letting every function reach for `darkAgi.*`
// directly) so unit tests can mock DARK AGI's HTTP layer and the DB without
// a running DARK AGI or MySQL instance.
const defaultDeps = {
  isDarkAgiEnabled: darkAgi.isDarkAgiEnabled,
  submitJob: darkAgi.submitJob,
  getJob: darkAgi.getJob,
  listScopes: darkAgi.listScopes,
  getEngineStatus: darkAgi.getEngineStatus,
  execute,
  log,
  maxRateCap: config.darkAgi.maxRateCap,
};

function resolveDeps(ctx) {
  return { ...defaultDeps, ...(ctx?.deps ?? {}) };
}

function errMessage(err) {
  if (err instanceof darkAgi.DarkAgiHttpError) {
    if (err.status === 401 || err.status === 403) {
      return `DARK AGI ปฏิเสธคำขอ (${err.status}): ${err.message} — ตรวจ API key / สิทธิ์ของผู้ใช้`;
    }
    if (err.status === 422) {
      return `DARK AGI ปฏิเสธ input (422): ${err.message}`;
    }
    return `DARK AGI HTTP ${err.status}: ${err.message}`;
  }
  return err?.message ?? String(err);
}

async function ensureEngineRunning(deps) {
  try {
    const status = await deps.getEngineStatus();
    const paused = status?.paused === true || status?.status === "PAUSED" || status?.state === "PAUSED";
    if (paused) {
      return { ok: false, reason: "DARK AGI engine หยุดทำงานอยู่ (emergency-stop) — ไม่ส่งงานใหม่จนกว่าจะ resume" };
    }
    return { ok: true };
  } catch {
    // Non-fatal: if we can't read engine status, let the actual job
    // submission be the real check rather than blocking everything on this.
    return { ok: true };
  }
}

async function ensureScopeCoverage(targets, deps) {
  try {
    const scopes = await deps.listScopes();
    const covered = targetsWithinScopes(targets, scopes);
    if (!covered.ok) {
      return {
        ok: false,
        reason:
          `เป้าหมายต่อไปนี้ไม่อยู่ใน Scope ที่เปิดอยู่: ${covered.uncovered.join(", ")}. ` +
          `ไปสร้าง/แก้ Scope ที่ DARK AGI console ก่อน (POST /scopes ต้องใช้สิทธิ์ scopes:manage) — ` +
          `เอเจนต์จะไม่สร้างหรือขยาย scope ให้เอง`,
      };
    }
    return { ok: true };
  } catch (err) {
    // If we can't even list scopes (key lacks permission, DARK AGI down),
    // don't silently proceed — DARK AGI's own /jobs call will enforce scope
    // anyway, but tell the agent honestly why we couldn't pre-check it.
    return {
      ok: false,
      reason: `ตรวจ Scope ไม่สำเร็จ (${errMessage(err)}) — ไม่ส่งงานจนกว่าจะยืนยัน scope ได้`,
    };
  }
}

function jobSummary(job) {
  return {
    jobId: job?.id ?? null,
    status: job?.status ?? "UNKNOWN",
    toolId: job?.toolId ?? null,
    operationId: job?.operationId ?? null,
    requiresApproval: job?.requiresApproval ?? null,
  };
}

async function logScanCommand(deps, { agentId, runId, action, targets, script, jobId, note }) {
  await deps.log({
    agentId,
    runId,
    level: "info",
    message: `DARK_AGI_SCAN: ${action} targets=[${(targets ?? []).join(",")}]${
      script ? ` script=[${script.join(",")}]` : ""
    } jobId=${jobId ?? "-"}${note ? ` note=${note}` : ""}`,
  });
}

/**
 * os_fingerprint(targets, maxRate?) — submits nmap:os-fingerprint. Returns a
 * jobId immediately; does not wait for approval or the scan to finish.
 */
export async function runOsFingerprint(args, ctx = {}) {
  const { agentId = null, runId = null } = ctx;
  const deps = resolveDeps(ctx);

  if (!deps.isDarkAgiEnabled()) {
    return "ERROR: DARK AGI is not configured (set DARK_AGI_API_KEY in .env.local).";
  }

  const targetsCheck = validateTargets(args?.targets);
  if (!targetsCheck.ok) return `ERROR: ${targetsCheck.reason}`;

  const engineCheck = await ensureEngineRunning(deps);
  if (!engineCheck.ok) return `ERROR: ${engineCheck.reason}`;

  const scopeCheck = await ensureScopeCoverage(targetsCheck.targets, deps);
  if (!scopeCheck.ok) return `ERROR: ${scopeCheck.reason}`;

  const maxRate = clampMaxRate(args?.maxRate, deps.maxRateCap);

  try {
    const job = await deps.submitJob("nmap", "os-fingerprint", {
      targets: targetsCheck.targets,
      maxRate,
    });
    await logScanCommand(deps, { agentId, runId, action: "os_fingerprint", targets: targetsCheck.targets, jobId: job?.id });
    return JSON.stringify({
      ...jobSummary(job),
      note:
        job?.status === "AWAITING_APPROVAL"
          ? "รอผู้ปฏิบัติงานมนุษย์อนุมัติในคอนโซล DARK AGI ก่อนจึงจะรัน — ใช้ get_scan_job(jobId) เพื่อเช็คสถานะภายหลัง"
          : "ใช้ get_scan_job(jobId) เพื่อเช็คสถานะ/ผลลัพธ์",
    });
  } catch (err) {
    await logScanCommand(deps, {
      agentId,
      runId,
      action: "os_fingerprint",
      targets: targetsCheck.targets,
      note: `FAILED: ${errMessage(err)}`,
    });
    return `ERROR: ${errMessage(err)}`;
  }
}

/**
 * nse_scan(targets, scripts[], maxRate?) — submits nmap:script-scan with an
 * allow-listed subset of NSE scripts/categories only (see nmapGuard.mjs).
 */
export async function runNseScan(args, ctx = {}) {
  const { agentId = null, runId = null } = ctx;
  const deps = resolveDeps(ctx);

  if (!deps.isDarkAgiEnabled()) {
    return "ERROR: DARK AGI is not configured (set DARK_AGI_API_KEY in .env.local).";
  }

  const targetsCheck = validateTargets(args?.targets);
  if (!targetsCheck.ok) return `ERROR: ${targetsCheck.reason}`;

  const scriptsCheck = validateNseScripts(args?.scripts);
  if (!scriptsCheck.ok) return `ERROR: ${scriptsCheck.reason}`;

  const engineCheck = await ensureEngineRunning(deps);
  if (!engineCheck.ok) return `ERROR: ${engineCheck.reason}`;

  const scopeCheck = await ensureScopeCoverage(targetsCheck.targets, deps);
  if (!scopeCheck.ok) return `ERROR: ${scopeCheck.reason}`;

  const maxRate = clampMaxRate(args?.maxRate, deps.maxRateCap);

  try {
    const job = await deps.submitJob("nmap", "script-scan", {
      targets: targetsCheck.targets,
      script: scriptsCheck.scripts,
      maxRate,
    });
    await logScanCommand(deps, {
      agentId,
      runId,
      action: "nse_scan",
      targets: targetsCheck.targets,
      script: scriptsCheck.scripts,
      jobId: job?.id,
    });
    return JSON.stringify({
      ...jobSummary(job),
      script: scriptsCheck.scripts,
      note:
        job?.status === "AWAITING_APPROVAL"
          ? "รอผู้ปฏิบัติงานมนุษย์อนุมัติในคอนโซล DARK AGI ก่อนจึงจะรัน — ใช้ get_scan_job(jobId) เพื่อเช็คสถานะภายหลัง"
          : "ใช้ get_scan_job(jobId) เพื่อเช็คสถานะ/ผลลัพธ์",
    });
  } catch (err) {
    await logScanCommand(deps, {
      agentId,
      runId,
      action: "nse_scan",
      targets: targetsCheck.targets,
      script: scriptsCheck.scripts,
      note: `FAILED: ${errMessage(err)}`,
    });
    return `ERROR: ${errMessage(err)}`;
  }
}

/** Best-effort explanation for a common, non-retryable Windows nmap failure. */
function explainFailure(job) {
  const raw = `${job?.error ?? ""} ${JSON.stringify(job?.result ?? "")}`.toLowerCase();
  if (raw.includes("npcap") || raw.includes("winpcap") || (raw.includes("administrator") && raw.includes("-o"))) {
    return (
      "FAILED — ดูเหมือนเป็นข้อจำกัดของ Windows: การทำ -O (OS fingerprint) ต้องติดตั้ง Npcap " +
      "และรันด้วยสิทธิ์ administrator บนเครื่องที่รัน DARK AGI ตรวจสองอย่างนี้แล้วลองใหม่ (ไม่ใช่ retry อัตโนมัติ)"
    );
  }
  return job?.error ? `FAILED: ${job.error}` : "FAILED (ไม่มีรายละเอียดเพิ่มเติมจาก DARK AGI)";
}

async function persistScanResult(job, deps) {
  const hosts = Array.isArray(job?.result?.hosts) ? job.result.hosts : [];
  if (hosts.length === 0) return;
  for (const host of hosts) {
    const address = String(host?.address ?? "").slice(0, 255);
    if (!address) continue;
    const osMatches = Array.isArray(host?.os) ? host.os : [];
    const scripts = Array.isArray(host?.scripts) ? host.scripts : [];
    const topOs = osMatches[0] ?? null;
    try {
      await deps.execute(
        `INSERT INTO dark_agi_scan_results
           (job_id, tool_id, operation_id, host, os_name, os_accuracy, scripts, status, raw_result)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           os_name = VALUES(os_name), os_accuracy = VALUES(os_accuracy),
           scripts = VALUES(scripts), status = VALUES(status),
           raw_result = VALUES(raw_result), updated_at = CURRENT_TIMESTAMP`,
        [
          String(job.id),
          String(job.toolId ?? ""),
          String(job.operationId ?? ""),
          address,
          topOs?.name ? String(topOs.name).slice(0, 160) : null,
          Number.isFinite(topOs?.accuracy) ? Math.round(topOs.accuracy) : null,
          JSON.stringify(scripts),
          String(job.status ?? "SUCCEEDED"),
          JSON.stringify(host),
        ],
      );
    } catch (err) {
      // Table may not exist yet on a DB that hasn't run /api/db/init-tables —
      // don't fail the whole status check over persistence; the agent still
      // gets the live result text either way.
      await deps.log({
        agentId: null,
        runId: null,
        level: "warn",
        message: `DARK_AGI_SCAN persist failed for job ${job.id}: ${err?.message ?? err}`,
      });
    }
  }
}

/**
 * get_scan_job(jobId) — polls one job once (no internal retry loop; the
 * agent calls this again later itself). On a terminal SUCCEEDED result,
 * normalizes and upserts each host's OS/script findings into
 * dark_agi_scan_results before replying.
 */
export async function runGetScanJob(args, ctx = {}) {
  const { agentId = null, runId = null } = ctx;
  const deps = resolveDeps(ctx);
  const jobId = String(args?.jobId ?? "").trim();
  if (!jobId) return "ERROR: ต้องระบุ jobId";

  if (!deps.isDarkAgiEnabled()) {
    return "ERROR: DARK AGI is not configured (set DARK_AGI_API_KEY in .env.local).";
  }

  try {
    const job = await deps.getJob(jobId);
    if (job?.status === "SUCCEEDED") {
      await persistScanResult(job, deps);
      await logScanCommand(deps, { agentId, runId, action: "get_scan_job", targets: job?.targets ?? [], jobId, note: "SUCCEEDED" });
      const hosts = Array.isArray(job?.result?.hosts) ? job.result.hosts : [];
      return JSON.stringify({
        ...jobSummary(job),
        hosts: hosts.map((h) => ({
          address: h?.address,
          os: h?.os ?? [],
          scripts: h?.scripts ?? [],
        })),
      });
    }
    if (job?.status === "FAILED") {
      await logScanCommand(deps, { agentId, runId, action: "get_scan_job", targets: job?.targets ?? [], jobId, note: "FAILED" });
      return JSON.stringify({ ...jobSummary(job), note: explainFailure(job) });
    }
    if (job?.status === "CANCELLED" || job?.status === "REJECTED") {
      return JSON.stringify({ ...jobSummary(job), note: `Job ${job.status.toLowerCase()} — ไม่มีผลลัพธ์` });
    }
    // AWAITING_APPROVAL / QUEUED / RUNNING — report as-is, don't block.
    return JSON.stringify({
      ...jobSummary(job),
      note:
        job?.status === "AWAITING_APPROVAL"
          ? "ยังรอผู้ปฏิบัติงานมนุษย์อนุมัติ"
          : `ยังทำงานอยู่ (${job?.status}) — เรียก get_scan_job(jobId) ซ้ำภายหลัง`,
    });
  } catch (err) {
    return `ERROR: ${errMessage(err)}`;
  }
}

export const DARK_AGI_SCAN_TOOL_NAMES = new Set(["os_fingerprint", "nse_scan", "get_scan_job"]);

export async function handleDarkAgiScanTool(name, args, ctx) {
  if (name === "os_fingerprint") return runOsFingerprint(args, ctx);
  if (name === "nse_scan") return runNseScan(args, ctx);
  if (name === "get_scan_job") return runGetScanJob(args, ctx);
  return `ERROR: unknown tool ${name}`;
}
