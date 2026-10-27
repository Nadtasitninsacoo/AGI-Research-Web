"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/types";
import { text } from "@/lib/validate";
import { parseTargets } from "@/lib/targets";

const asObject = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === "object") return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const o = JSON.parse(v);
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  }
  return {};
};

/**
 * Launch a command straight into the engine queue via MySQL (no backend token).
 * The running worker claims the queued run within ~2s.
 */
export async function launchCommandAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const agentName = text(formData.get("agent"));
  const prompt = text(formData.get("prompt"));
  const orchestrate = formData.get("orchestrate") === "on";
  const scopeLabel = text(formData.get("scopeLabel"));
  const scopeTargetsRaw = text(formData.get("scopeTargets"));

  if (!agentName) return { ok: false, message: "เลือกเอเจนต์หรือทีมก่อน" };
  if (prompt.length < 1) return { ok: false, message: "พิมพ์คำสั่ง / ภารกิจก่อน" };
  if (prompt.length > 8000) return { ok: false, message: "คำสั่งยาวเกิน 8000 ตัวอักษร" };

  try {
    const [agents] = await db.query<RowDataPacket[]>(
      "SELECT id, config FROM agents WHERE name = ? LIMIT 1",
      [agentName],
    );
    const agent = agents[0];
    if (!agent) return { ok: false, message: `ไม่พบเอเจนต์ "${agentName}"` };

    // Optionally (re)set the engagement scope on this agent. The field accepts
    // many targets separated by anything (space / newline / comma / ; / |).
    const targets = parseTargets(scopeTargetsRaw);
    if (targets.length) {
      const cfg = asObject(agent.config);
      const prevScope = asObject(cfg.scope);
      cfg.scope = { label: scopeLabel || (prevScope.label as string) || null, targets };
      await db.query("UPDATE agents SET config = ? WHERE id = ?", [JSON.stringify(cfg), agent.id]);
    }

    // Ensure a project + experiment exist for this agent.
    const [exps] = await db.query<RowDataPacket[]>(
      "SELECT id FROM experiments WHERE agent_id = ? ORDER BY id LIMIT 1",
      [agent.id],
    );
    let experimentId = exps[0]?.id as number | undefined;
    if (!experimentId) {
      const [projs] = await db.query<RowDataPacket[]>("SELECT id FROM research_projects ORDER BY id LIMIT 1");
      let projectId = projs[0]?.id as number | undefined;
      if (!projectId) {
        const [p] = await db.query<ResultSetHeader>(
          "INSERT INTO research_projects (title, summary, status) VALUES ('Command Center','Operator-launched tasks','active')",
        );
        projectId = p.insertId;
      }
      const [e] = await db.query<ResultSetHeader>(
        "INSERT INTO experiments (project_id, agent_id, name, status) VALUES (?,?,?,'planned')",
        [projectId, agent.id, `CMD-${agentName}`],
      );
      experimentId = e.insertId;
    }

    const [r] = await db.query<ResultSetHeader>(
      "INSERT INTO experiment_runs (experiment_id, params, status) VALUES (?, ?, 'queued')",
      [experimentId, JSON.stringify({ prompt, orchestrate })],
    );

    revalidatePath("/runs");
    revalidatePath("/command");
    return { ok: true, message: `สั่งงานแล้ว — run #${r.insertId}`, id: r.insertId };
  } catch {
    return { ok: false, message: "สั่งงานไม่สำเร็จ: เชื่อมต่อฐานข้อมูลไม่ได้" };
  }
}

/**
 * Delete one or more runs and their children (logs + evaluations) straight
 * from MySQL. Destructive and irreversible — the UI gates it behind an
 * in-app confirm modal. Children are removed first so the delete works
 * whether or not the schema declares ON DELETE CASCADE. Called directly from
 * the client (not as a form action), so it takes a plain id array.
 */
export async function deleteRuns(rawIds: number[]): Promise<FormState> {
  const ids = Array.from(new Set((rawIds ?? []).filter((n) => Number.isSafeInteger(n) && n > 0)));
  if (ids.length === 0) return { ok: false, message: "ยังไม่ได้เลือกงาน" };
  if (ids.length > 100) return { ok: false, message: "เลือกได้สูงสุด 100 งานต่อครั้ง" };

  try {
    // mysql2 .query() expands an array bound to `IN (?)`.
    await db.query("DELETE FROM evaluations WHERE run_id IN (?)", [ids]);
    await db.query("DELETE FROM agent_logs WHERE run_id IN (?)", [ids]);
    const [res] = await db.query<ResultSetHeader>("DELETE FROM experiment_runs WHERE id IN (?)", [ids]);
    if (res.affectedRows === 0) return { ok: false, message: "ไม่พบงานที่เลือก" };

    revalidatePath("/runs");
    revalidatePath("/command");
    return { ok: true, message: `ลบแล้ว ${res.affectedRows} งาน` };
  } catch {
    return { ok: false, message: "ลบไม่สำเร็จ: เชื่อมต่อฐานข้อมูลไม่ได้" };
  }
}
