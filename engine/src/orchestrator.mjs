// Multi-agent orchestrator (HYDRA).
//
// Flow for one run:
//   1. PLAN     — HYDRA breaks the objective into 1..MAX subtasks, each assigned
//                 to a specialist agent by name.
//   2. DELEGATE — each subtask runs as the assigned specialist (reusing runAgent),
//                 inheriting the same engagement scope and all guardrails. Logs
//                 are attributed to each specialist under the same run.
//   3. SYNTHESIZE — HYDRA merges the subtask results into one unified answer.
//
// Everything stays inside the existing scope + policy + approval controls: the
// orchestrator cannot grant a specialist more than that specialist already has.
import { chat } from "./ollama.mjs";
import { runAgent } from "./agentLoop.mjs";
import { log } from "./logger.mjs";
import { query } from "./db.mjs";
import { config } from "./config.mjs";

const MAX_SUBTASKS = 5;
// Agents HYDRA may delegate to (never itself).
const DELEGATABLE = ["ORACLE-7", "RECON-1", "CERBERUS", "WRAITH", "NEMESIS"];

const asObject = (v) => {
  if (v == null) return {};
  if (typeof v === "object") return v;
  try { return JSON.parse(String(v)); } catch { return {}; }
};

function parseJson(text) {
  if (!text || typeof text !== "string") return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  for (const chunk of [candidate, candidate.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!chunk) continue;
    try {
      const obj = JSON.parse(chunk);
      if (obj && typeof obj === "object") return obj;
    } catch { /* keep trying */ }
  }
  return null;
}

async function loadRoster() {
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
      toolsEnabled: cfg.tools_enabled === true,
    });
  }
  return map;
}

/**
 * Run an objective as a coordinated team.
 * Same signature shape as runAgent so index.mjs can swap them.
 */
export async function runOrchestrator({ runId, agentId, objective, scope, runParams }) {
  const started = Date.now();
  const roster = await loadRoster();
  const available = [...roster.keys()];
  let inputTokens = 0;
  let outputTokens = 0;

  if (!available.length) {
    const msg = "No specialist agents available to delegate to. Run scripts/seed-agents.mjs.";
    await log({ agentId, runId, level: "error", message: msg });
    return { status: "failed", summary: msg, findings: [], metrics: { output: msg, latencyMs: Date.now() - started } };
  }

  // 1) PLAN -----------------------------------------------------------------
  const rosterDesc = available
    .map((n) => {
      const r = roster.get(n);
      const firstLine = r.config.role_addendum ? String(r.config.role_addendum).split("\n")[0] : n;
      return `- ${n}${r.toolsEnabled ? " [can run tools]" : " [text only]"}: ${firstLine}`;
    })
    .join("\n");

  const planModel = roster.get(available[0]).model; // HYDRA runs on the same local model
  const planSystem =
    `You are HYDRA, the multi-agent team coordinator. Plan how a team of specialists will accomplish the objective. ` +
    `Split it into 1-${MAX_SUBTASKS} concrete subtasks, each assigned to exactly ONE agent by its exact name. ` +
    `Only these agents exist:\n${rosterDesc}\n\n` +
    `Order subtasks logically (planning/recon first, analysis/synthesis later). Keep each task specific and within the authorized scope. ` +
    `Respond ONLY with JSON: {"plan":[{"agent":"<name>","task":"<concrete subtask>"}]}`;

  let plan = [];
  try {
    const r = await chat({ model: planModel, messages: [
      { role: "system", content: planSystem },
      { role: "user", content: objective },
    ] });
    inputTokens += r.promptTokens; outputTokens += r.outputTokens;
    const parsed = parseJson(r.message?.content || "");
    if (parsed && Array.isArray(parsed.plan)) plan = parsed.plan;
  } catch (err) {
    await log({ agentId, runId, level: "error", message: `Planning call failed: ${err?.message ?? err}` });
  }

  plan = plan.filter((s) => s && roster.has(s.agent) && typeof s.task === "string" && s.task.trim()).slice(0, MAX_SUBTASKS);
  if (!plan.length) {
    const fb = roster.has("ORACLE-7") ? "ORACLE-7" : available[0];
    plan = [{ agent: fb, task: objective }];
    await log({ agentId, runId, level: "warn", message: `No valid plan produced; falling back to a single ${fb} task.` });
  }
  await log({
    agentId, runId, level: "info",
    message: `HYDRA plan (${plan.length}): ${plan.map((s, i) => `${i + 1}.${s.agent}`).join("  ")}`,
    context: { plan },
  });

  // 2) DELEGATE -------------------------------------------------------------
  const results = [];
  for (const [i, step] of plan.entries()) {
    const sp = roster.get(step.agent);
    await log({ agentId, runId, level: "info", message: `DELEGATE ${i + 1}/${plan.length} -> ${step.agent}: ${step.task}` });
    try {
      const res = await runAgent({
        runId, agentId: sp.id, agentName: step.agent, model: sp.model,
        objective: step.task, scope, agentConfig: sp.config, runParams, toolsEnabled: sp.toolsEnabled,
      });
      inputTokens += res.metrics?.inputTokens ?? 0;
      outputTokens += res.metrics?.outputTokens ?? 0;
      results.push({ agent: step.agent, task: step.task, status: res.status, summary: res.summary, findings: res.findings ?? [] });
    } catch (err) {
      const msg = err?.message ?? String(err);
      results.push({ agent: step.agent, task: step.task, status: "failed", summary: `error: ${msg}`, findings: [] });
      await log({ agentId, runId, level: "error", message: `Subtask ${step.agent} crashed: ${msg}` });
    }
  }

  // 3) SYNTHESIZE -----------------------------------------------------------
  const synthSystem =
    `You are HYDRA. Integrate the team's subtask results into ONE unified answer for the commander. ` +
    `Resolve conflicts, remove redundancy, and be faithful to what each agent actually found (do not invent results). ` +
    `Respond strictly as JSON: {"summary":"...","reasoning_notes":["..."],"confidence":0.0,"limitations":["..."],"content":"..."}`;
  const synthUser =
    `Objective:\n${objective}\n\nSubtask results:\n` +
    results.map((r, i) => `[${i + 1}] ${r.agent} (${r.status}) — task: ${r.task}\n${r.summary}`).join("\n\n");

  let finalSummary = "";
  let structured = null;
  try {
    const r = await chat({ model: planModel, messages: [
      { role: "system", content: synthSystem },
      { role: "user", content: synthUser },
    ] });
    inputTokens += r.promptTokens; outputTokens += r.outputTokens;
    finalSummary = String(r.message?.content ?? "").trim();
    structured = parseJson(finalSummary);
  } catch (err) {
    finalSummary = `Synthesis call failed: ${err?.message ?? err}`;
    await log({ agentId, runId, level: "error", message: finalSummary });
  }

  const allFindings = results.flatMap((r) => (Array.isArray(r.findings) ? r.findings : []));
  const status = structured || results.some((r) => r.status === "succeeded") ? "succeeded" : "failed";
  await log({ agentId, runId, level: "info", message: `HYDRA synthesis complete over ${results.length} subtasks.` });

  return {
    status,
    summary: finalSummary || "(no synthesis)",
    findings: allFindings,
    metrics: {
      output: structured?.content || structured?.summary || finalSummary,
      structured: structured ?? null,
      plan,
      subResults: results.map((r) => ({ agent: r.agent, task: r.task, status: r.status, summary: r.summary })),
      findings: allFindings,
      accuracy: typeof structured?.confidence === "number" ? structured.confidence : undefined,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - started,
    },
  };
}
