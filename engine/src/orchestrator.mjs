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
import { buildHandoff, confirmFindings, decideSuccess, injectHandoff, triageUnverified, validatePlan, verifyHandoff, verifySubtask } from "./verify.mjs";

const MAX_SUBTASKS = 5;
// Extra re-planning rounds after the first pass, for subtasks that fail for
// technical reasons (never for guardrail-blocked ones).
const MAX_ROUNDS = Number(process.env.ORCH_MAX_ROUNDS ?? 2);
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
  // Drop exact-duplicate subtasks so the team never does identical work twice.
  {
    const pv = validatePlan(plan);
    if (pv.dropped.length) {
      await log({ agentId, runId, level: "warn", message: `PLAN check: dropped ${pv.dropped.length} duplicate subtask(s): ${pv.dropped.map((s) => s?.agent).join(", ")}` });
    }
    plan = pv.plan;
  }
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

  // 2) DELEGATE + ADAPT -----------------------------------------------------
  // Each subtask receives the prior subtasks' results as data (handoff), so
  // e.g. RECON-1's output actually reaches ORACLE-7. Every subtask is verified
  // for real work and its findings confirmed against evidence. Subtasks that
  // fail for a TECHNICAL reason are re-planned with a new approach for up to
  // MAX_ROUNDS rounds; subtasks stopped by a GUARDRAIL (scope/policy/approval)
  // are escalated to a human and never retried around.
  const results = [];
  const handoffs = [];
  const escalations = [];

  async function delegate(step, label) {
    const sp = roster.get(step.agent);
    const handoff = buildHandoff(results);
    const task = injectHandoff(step.task, handoff);
    const ho = verifyHandoff(handoff, task);
    if (results.length > 0) {
      handoffs.push({ to: step.agent, ...ho });
      await log({
        agentId, runId, level: ho.chars && !ho.ok ? "error" : "info",
        message: `HANDOFF -> ${step.agent}: ${ho.reason}`,
        context: { to: step.agent, sources: ho.sources, chars: ho.chars, ok: ho.ok },
      });
    }
    await log({ agentId, runId, level: "info", message: `DELEGATE ${label} -> ${step.agent}: ${step.task}` });
    try {
      const res = await runAgent({
        runId, agentId: sp.id, agentName: step.agent, model: sp.model,
        objective: task, scope, agentConfig: sp.config, runParams, toolsEnabled: sp.toolsEnabled,
      });
      inputTokens += res.metrics?.inputTokens ?? 0;
      outputTokens += res.metrics?.outputTokens ?? 0;
      const evidence = res.metrics?.evidence ?? res.evidence ?? {};
      const findings = confirmFindings(res.findings ?? [], evidence);
      const verdict = verifySubtask({ status: res.status, summary: res.summary, evidence });
      const confirmedCount = findings.filter((f) => f.confirmed).length;
      await log({
        agentId, runId, level: verdict.verified ? "info" : "warn",
        message: `VERIFY ${step.agent}: ${verdict.verified ? "work verified" : "unverified"} — ${verdict.reason}; ` +
          `findings ${confirmedCount}/${findings.length} confirmed (commandsOk=${evidence.commandsOk ?? 0}, blocked=${evidence.blocked ?? 0})`,
        context: { verified: verdict.verified, confirmedCount, findings: findings.length, evidence },
      });
      results.push({ agent: step.agent, task: step.task, status: res.status, summary: res.summary, findings, verified: verdict.verified, verifyReason: verdict.reason, evidence });
    } catch (err) {
      const msg = err?.message ?? String(err);
      results.push({ agent: step.agent, task: step.task, status: "failed", summary: `error: ${msg}`, findings: [], verified: false, verifyReason: "subtask crashed", evidence: {} });
      await log({ agentId, runId, level: "error", message: `Subtask ${step.agent} crashed: ${msg}` });
    }
  }

  // Initial pass.
  for (const [i, step] of plan.entries()) await delegate(step, `${i + 1}/${plan.length}`);

  // Adaptive re-planning: close technical gaps with new approaches; escalate guardrail blocks.
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const { retry, escalate } = triageUnverified(results);
    for (const e of escalate) {
      if (escalations.includes(e)) continue;
      escalations.push(e);
      await log({
        agentId, runId, level: "warn",
        message: `ESCALATE ${e.agent}: stopped by a guardrail (scope/policy/approval). Needs human authorization — not retried.`,
        context: { agent: e.agent, task: e.task, evidence: e.evidence },
      });
    }
    if (!retry.length) break;

    const open = retry.map((r) => `- ${r.agent} on "${r.task}" did not verify (${r.verifyReason})`).join("\n");
    const replanSystem =
      `You are HYDRA. Some subtasks did not produce a verified result for TECHNICAL reasons (not authorization). ` +
      `Propose a NEW plan that tries DIFFERENT, in-scope, authorized approaches to close the gaps. ` +
      `Do NOT attempt to bypass scope, policy, or approval boundaries — those are hard limits; if a gap needs them, leave it out. ` +
      `Only these agents exist:\n${rosterDesc}\n\nRespond ONLY with JSON: {"plan":[{"agent":"<name>","task":"<concrete subtask>"}]}`;
    let rplan = [];
    try {
      const r = await chat({ model: planModel, messages: [
        { role: "system", content: replanSystem },
        { role: "user", content: `Objective:\n${objective}\n\nStill open:\n${open}` },
      ] });
      inputTokens += r.promptTokens; outputTokens += r.outputTokens;
      const parsed = parseJson(r.message?.content || "");
      if (parsed && Array.isArray(parsed.plan)) rplan = parsed.plan;
    } catch (err) {
      await log({ agentId, runId, level: "error", message: `Re-planning call failed: ${err?.message ?? err}` });
    }
    rplan = rplan.filter((s) => s && roster.has(s.agent) && typeof s.task === "string" && s.task.trim()).slice(0, MAX_SUBTASKS);
    rplan = validatePlan(rplan).plan;
    if (!rplan.length) {
      await log({ agentId, runId, level: "warn", message: `Round ${round}: no new approach produced; stopping adaptation.` });
      break;
    }
    await log({
      agentId, runId, level: "info",
      message: `HYDRA re-plan (round ${round}/${MAX_ROUNDS}, ${rplan.length}): ${rplan.map((s) => s.agent).join("  ")}`,
      context: { round, plan: rplan },
    });
    for (const [i, step] of rplan.entries()) await delegate(step, `R${round}.${i + 1}`);
  }

  // 3) SYNTHESIZE -----------------------------------------------------------
  // Findings split by verification so HYDRA reports confirmed vulnerabilities
  // clearly and never dresses up an unbacked claim as a real one.
  const allFindings = results.flatMap((r) => (Array.isArray(r.findings) ? r.findings : []));
  const confirmedFindings = allFindings.filter((f) => f.confirmed);
  const unconfirmedFindings = allFindings.filter((f) => !f.confirmed);
  const verdicts = results.map((r) => ({ agent: r.agent, verified: r.verified, reason: r.verifyReason }));
  const success = decideSuccess(verdicts);
  // Final escalation set: unverified work stopped by a guardrail needs a human.
  const { escalate: blockedItems } = triageUnverified(results);
  const needsAuthorization = blockedItems.map((r) => ({ agent: r.agent, task: r.task, reason: "guardrail-blocked (scope/policy/approval)" }));

  const synthSystem =
    `You are HYDRA. Integrate the team's subtask results into ONE unified answer for the commander. ` +
    `Resolve conflicts, remove redundancy, and be faithful to what each agent actually found (do not invent results). ` +
    `Only call a vulnerability CONFIRMED if it is marked confirmed below; present the rest as unverified leads. ` +
    `Respond strictly as JSON: {"summary":"...","reasoning_notes":["..."],"confidence":0.0,"limitations":["..."],"content":"..."}`;
  const synthUser =
    `Objective:\n${objective}\n\nSubtask results (with verification):\n` +
    results
      .map((r, i) => `[${i + 1}] ${r.agent} (${r.status}, ${r.verified ? "VERIFIED" : "UNVERIFIED"}) — task: ${r.task}\n${r.summary}`)
      .join("\n\n") +
    `\n\nConfirmed findings: ${confirmedFindings.length}; unverified claims: ${unconfirmedFindings.length}.` +
    (needsAuthorization.length
      ? `\nNeeds human authorization (guardrail-blocked, do NOT present as done): ${needsAuthorization.map((e) => e.agent).join(", ")}.`
      : "");

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

  // Success is gated on verified subtasks, not on the synthesis returning JSON.
  const status = success.status;
  await log({
    agentId, runId, level: status === "succeeded" ? "info" : "warn",
    message: `HYDRA verification: ${success.reason}; findings ${confirmedFindings.length} confirmed, ${unconfirmedFindings.length} unverified over ${results.length} subtasks` +
      (needsAuthorization.length ? `; ${needsAuthorization.length} need human authorization.` : "."),
    context: { success, confirmed: confirmedFindings.length, unconfirmed: unconfirmedFindings.length, handoffs, needsAuthorization },
  });

  return {
    status,
    summary: finalSummary || "(no synthesis)",
    findings: confirmedFindings,
    metrics: {
      output: structured?.content || structured?.summary || finalSummary,
      structured: structured ?? null,
      plan,
      subResults: results.map((r) => ({ agent: r.agent, task: r.task, status: r.status, summary: r.summary, verified: r.verified, verifyReason: r.verifyReason })),
      findings: confirmedFindings,
      unconfirmedFindings,
      verification: { ...success, subtasks: verdicts, confirmedFindings: confirmedFindings.length, unconfirmedFindings: unconfirmedFindings.length },
      needsAuthorization,
      handoffs,
      accuracy: typeof structured?.confidence === "number" ? structured.confidence : undefined,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - started,
    },
  };
}
