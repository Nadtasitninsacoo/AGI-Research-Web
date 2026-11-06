"use server";

import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import type {
  TeamTaskPlan,
  TeamTaskPlanAgent,
  TeamTaskTarget,
} from "@/lib/team-task-plans/api";

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v ?? "");

function normalizeStatus(value: unknown): TeamTaskPlan["status"] {
  const s = String(value);
  return s === "queued" || s === "cancelled" ? s : "draft";
}

/**
 * Read Team Task Plans directly from the local DB, with their agents and
 * targets. Replaces the call that went to the retired/broken NestJS backend
 * (/api/research/team-task-plans → :3001, which returns HTTP 500), matching how
 * run-batches and runs already read the DB directly. Returns [] on any error.
 */
export async function listTeamTaskPlans(): Promise<TeamTaskPlan[]> {
  try {
    const [plans] = await db.query<RowDataPacket[]>(
      `SELECT id, name, description, status, created_at, updated_at
         FROM team_task_plans
        ORDER BY id DESC
        LIMIT 200`,
    );

    if (plans.length === 0) return [];

    const ids = plans.map((p) => Number(p.id));

    const [[agentRows], [targetRows]] = await Promise.all([
      db.query<RowDataPacket[]>(
        `SELECT tpa.plan_id, tpa.agent_id, tpa.role, a.name
           FROM team_task_plan_agents tpa
           LEFT JOIN agents a ON a.id = tpa.agent_id
          WHERE tpa.plan_id IN (?)`,
        [ids],
      ),
      db.query<RowDataPacket[]>(
        `SELECT id, plan_id, target_type, ip, port, service
           FROM team_task_plan_targets
          WHERE plan_id IN (?)`,
        [ids],
      ),
    ]);

    const agentsByPlan = new Map<number, TeamTaskPlanAgent[]>();
    for (const r of agentRows) {
      const pid = Number(r.plan_id);
      const list = agentsByPlan.get(pid) ?? [];
      list.push({
        id: Number(r.agent_id),
        name: r.name != null ? String(r.name) : `Agent #${r.agent_id}`,
        role: r.role != null ? String(r.role) : "",
      });
      agentsByPlan.set(pid, list);
    }

    const targetsByPlan = new Map<number, TeamTaskTarget[]>();
    for (const r of targetRows) {
      const pid = Number(r.plan_id);
      const list = targetsByPlan.get(pid) ?? [];
      list.push({
        id: Number(r.id),
        targetType: String(r.target_type) === "port" ? "port" : "ip",
        ip: String(r.ip),
        port: r.port != null ? Number(r.port) : null,
        service: r.service != null ? String(r.service) : null,
        // Not stored on this table — kept null/false rather than fabricated.
        country: null,
        city: null,
        region: null,
        isAuthorized: false,
        authorizationStatus: null,
      });
      targetsByPlan.set(pid, list);
    }

    return plans.map((p) => {
      const pid = Number(p.id);
      return {
        id: pid,
        name: String(p.name),
        description: p.description != null ? String(p.description) : null,
        status: normalizeStatus(p.status),
        createdAt: iso(p.created_at),
        updatedAt: iso(p.updated_at),
        targets: targetsByPlan.get(pid) ?? [],
        agents: agentsByPlan.get(pid) ?? [],
      };
    });
  } catch {
    return [];
  }
}
