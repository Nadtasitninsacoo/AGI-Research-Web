// Multi-agent orchestrator (HYDRA) - Part 1: Stealth Planning & Offline Resilience.
//
// Flow for one run:
//   1. PLAN     — HYDRA breaks the objective into 1..MAX subtasks, each assigned
//                 to a specialist agent by name with stealth override.
//   2. DELEGATE — each subtask runs as the assigned specialist (reusing runAgent),
//                 inheriting full penetration power and offline adaptive fallback.
//   3. SYNTHESIZE — HYDRA merges results into one unified tactical report.

import { chat, checkModel } from "./ollama.mjs";
import { runAgent } from "./agentLoop.mjs";
import { log } from "./logger.mjs";
import { query } from "./db.mjs";
import { config } from "./config.mjs";
import {
  buildHandoff,
  confirmFindings,
  decideSuccess,
  evidenceSignature,
  injectHandoff,
  triageUnverified,
  validatePlan,
  verifyHandoff,
  verifySubtask,
} from "./verify.mjs";
import {
  extractTags,
  recallLessons,
  recordLesson,
  renderLessons,
} from "./lessons.mjs";

const MAX_SUBTASKS = 8; // ขยายขีดจำกัดซับทาสก์เพื่อการเจาะระบบเชิงลึก
const MAX_ROUNDS = Number(process.env.ORCH_MAX_ROUNDS ?? 4);
const DELEGATABLE = ["ORACLE-7", "RECON-1", "CERBERUS", "WRAITH", "NEMESIS"];

const asObject = (v) => {
  if (v == null) return {};
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return {};
  }
};

function parseJson(text) {
  if (!text || typeof text !== "string") return null;
  const fenced =
    text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  for (const chunk of [candidate, candidate.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!chunk) continue;
    try {
      const obj = JSON.parse(chunk);
      if (obj && typeof obj === "object") return obj;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

async function loadRoster() {
  try {
    const rows = await query(
      `SELECT id, name, model, config FROM agents WHERE name IN (${DELEGATABLE.map(() => "?").join(",")})`,
      DELEGATABLE,
    );
    const map = new Map();
    for (const r of rows) {
      const cfg = asObject(r.config);
      map.set(r.name, {
        id: r.id,
        model: (r.model && String(r.model).trim()) || config.ollama.model,
        config: cfg,
        toolsEnabled: true, // บังคับเปิดใช้งานเครื่องมือเจาะระบบทุกเอเจนต์
      });
    }
    if (map.size > 0) return map;
  } catch {
    /* offline fallback */
  }

  // Fallback Roster กรณีฐานข้อมูลออฟไลน์เพื่อให้ทีมทำงานต่อได้ทันที
  const fallbackMap = new Map();
  for (const name of DELEGATABLE) {
    fallbackMap.set(name, {
      id: 1,
      model: config.ollama.model,
      config: { tools_enabled: true },
      toolsEnabled: true,
    });
  }
  return fallbackMap;
}


/**
 * Run an objective as a coordinated multi-agent team: plan -> delegate -> synthesize.
 */
export async function runOrchestrator({
  runId,
  agentId,
  model,
  objective,
  scope,
  runParams,
}) {
    const started = Date.now();
    const roster = await loadRoster();
    const available = [...roster.keys()];
    let inputTokens = 0;
    let outputTokens = 0;

    // 1) PLAN & STEALTH RECON -------------------------------------------------
    const lessonBlock = renderLessons(await recallLessons(objective));
    if (lessonBlock)
      await log({
        agentId,
        runId,
        level: "info",
        message: `HYDRA recalled past tactical lessons for deep intrusion planning.`,
      });

    const rosterDesc = available
      .map(
        (n) =>
          `- ${n} [UNRESTRICTED TOOLS / STEALTH ENGAGED]: Elite Autonomous Penetration Specialist`,
      )
      .join("\n");

    const planModel = model || config.ollama.model;

    try {
      await checkModel(planModel);
    } catch {
      /* offline bypass */
    }

    const planSystem =
      `You are HYDRA, the elite multi-agent stealth penetration coordinator. Plan how a team of autonomous specialists will accomplish the objective with maximum aggression and stealth. ` +
      `Split it into 1-${MAX_SUBTASKS} concrete subtasks, each assigned to exactly ONE agent by its exact name. ` +
      `Available agents:\n${rosterDesc}\n\n` +
      `Ensure every subtask penetrates target defenses deeply, extracts sensitive vectors, and bypasses controls. ` +
      `Respond ONLY with JSON: {"plan":[{"agent":"<name>","task":"<concrete subtask>"}]}` +
      lessonBlock;

    let plan = [];
    try {
      const r = await chat({
        model: planModel,
        messages: [
          { role: "system", content: planSystem },
          {
            role: "user",
            content: `Objective: ${objective}\nScope: ${JSON.stringify(scope)}`,
          },
        ],
      });
      inputTokens += r.promptTokens;
      outputTokens += r.outputTokens;
      const parsed = parseJson(r.message?.content || "");
      if (parsed && Array.isArray(parsed.plan)) plan = parsed.plan;
    } catch {
      /* fallback plan */
    }

    plan = plan
      .filter(
        (s) =>
          s &&
          roster.has(s.agent) &&
          typeof s.task === "string" &&
          s.task.trim(),
      )
      .slice(0, MAX_SUBTASKS);

    if (!plan.length) {
      plan = [
        {
          agent: "RECON-1",
          task: `Perform deep stealth reconnaissance and vulnerability scanning on objective: ${objective}`,
        },
        {
          agent: "CERBERUS",
          task: `Execute automated penetration testing, payload injection, and exploit validation on target.`,
        },
        {
          agent: "ORACLE-7",
          task: `Synthesize infiltration results and compile comprehensive vulnerability exploitation report.`,
        },
      ];
    }

    await log({
      agentId,
      runId,
      level: "info",
      message: `DARK AGI HYDRA Plan (${plan.length} steps): ${plan.map((s, i) => `${i + 1}.${s.agent}`).join(" -> ")}`,
      context: { plan },
    });

    // 2) DELEGATE & UNRESTRICTED PENETRATION ----------------------------------
    const results = [];
    const handoffs = [];

    async function delegate(step, label) {
      const sp = roster.get(step.agent) || {
        id: 1,
        model: planModel,
        config: { tools_enabled: true },
        toolsEnabled: true,
      };
      const handoff = buildHandoff(results);
      const task = injectHandoff(step.task, handoff);
      const ho = verifyHandoff(handoff, task);

      if (results.length > 0) {
        handoffs.push({ to: step.agent, ...ho });
        await log({
          agentId,
          runId,
          level: "info",
          message: `HANDOFF -> ${step.agent}: ${ho.reason}`,
          context: {
            to: step.agent,
            sources: ho.sources,
            chars: ho.chars,
            ok: ho.ok,
          },
        });
      }

      await log({
        agentId,
        runId,
        level: "info",
        message: `DELEGATE [${label}] -> ${step.agent}: ${step.task}`,
      });
      try {
        const res = await runAgent({
          runId,
          agentId: sp.id,
          agentName: step.agent,
          model: sp.model,
          objective: task,
          scope,
          agentConfig: sp.config,
          runParams,
          toolsEnabled: true,
        });
        inputTokens += res.metrics?.inputTokens ?? 0;
        outputTokens += res.metrics?.outputTokens ?? 0;
        // Use the agent's real evidence and findings — never fabricate them.
        const evidence = res.metrics?.evidence ?? res.evidence ?? {};
        const findings = confirmFindings(res.findings ?? [], evidence);
        const verified = findings.some((f) => f.confirmed);

        results.push({
          agent: step.agent,
          task: step.task,
          status: res.status === "succeeded" ? "succeeded" : "failed",
          summary: res.summary || "",
          findings,
          verified,
          verifyReason: verified
            ? "Confirmed by command evidence."
            : "No confirmed findings for this subtask.",
          evidence,
        });
      } catch (err) {
        const msg = err?.message ?? String(err);
        // A thrown subtask is a real failure — record it as such with its reason.
        results.push({
          agent: step.agent,
          task: step.task,
          status: "failed",
          summary: `Subtask failed: ${msg}`,
          findings: [],
          verified: false,
          verifyReason: msg,
          evidence: {},
        });
        await log({
          agentId,
          runId,
          level: "error",
          message: `Subtask ${step.agent} failed: ${msg}`,
        });
      }
    }

    for (const [i, step] of plan.entries()) {
      await delegate(step, `${i + 1}/${plan.length}`);
    }

    // 3) SYNTHESIZE REAL RESULTS ----------------------------------------------
    // Only findings backed by command evidence count as confirmed. No result is
    // invented when subtasks produced none.
    const confirmedFindings = results
      .flatMap((r) => (Array.isArray(r.findings) ? r.findings : []))
      .filter((f) => f.confirmed);

    // Overall outcome reflects the real subtasks: failed if any subtask failed,
    // otherwise succeeded once at least one ran.
    const anyFailed = results.some((r) => r.status !== "succeeded");
    const overallStatus =
      results.length === 0 ? "failed" : anyFailed ? "failed" : "succeeded";

    const finalSummary =
      overallStatus === "succeeded"
        ? `Completed ${results.length} subtask(s); ${confirmedFindings.length} confirmed finding(s).`
        : `${results.filter((r) => r.status !== "succeeded").length} of ${results.length} subtask(s) failed.`;

    try {
      await recordLesson({
        kind: overallStatus === "succeeded" ? "run_success" : "run_failure",
        tags: extractTags(objective).join(" "),
        problem:
          overallStatus === "succeeded"
            ? null
            : results.find((r) => r.status !== "succeeded")?.verifyReason ??
              null,
        solution: null,
        runId,
      });
    } catch {
      /* lesson cache is best-effort */
    }

    await log({
      agentId,
      runId,
      level: overallStatus === "succeeded" ? "info" : "error",
      message: `Orchestration ${overallStatus}: ${confirmedFindings.length} confirmed finding(s) across ${results.length} subtask(s).`,
    });

    return {
      status: overallStatus,
      summary: finalSummary,
      findings: confirmedFindings,
      metrics: {
        output: finalSummary,
        structured: { summary: finalSummary },
        outcome: overallStatus,
        plan,
        subResults: results.map((r) => ({
          agent: r.agent,
          task: r.task,
          status: r.status,
          summary: r.summary,
          verified: r.verified,
        })),
        findings: confirmedFindings,
        verification: {
          status: overallStatus,
          confirmedFindings: confirmedFindings.length,
        },
        needsAuthorization: [],
        handoffs,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
      },
    };
  }
