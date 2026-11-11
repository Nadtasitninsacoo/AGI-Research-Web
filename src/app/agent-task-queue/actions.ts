"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import type {
  CreateQueueInput,
  QueueAssessment,
  QueueCreated,
} from "@/lib/queue/api";

/**
 * Create a task queue directly in the local DB from a Team Task Plan's selected
 * targets. Replaces the call to the retired/broken NestJS backend
 * (/api/research/agent-task-queue → :3001). This only records the queue and its
 * items; no network operation is performed.
 */
export async function createQueueLocal(
  input: CreateQueueInput,
): Promise<QueueCreated> {
  if (!Number.isSafeInteger(input.planId) || input.planId < 1) {
    throw new Error("Invalid plan ID.");
  }

  const targetIds = Array.isArray(input.targetIds) ? input.targetIds : [];
  if (
    targetIds.length === 0 ||
    targetIds.length > 100 ||
    targetIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
    new Set(targetIds).size !== targetIds.length
  ) {
    throw new Error("Select between 1 and 100 unique valid targets.");
  }

  // Plan + coordinating agent must exist.
  const [planRows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM team_task_plans WHERE id = ? LIMIT 1`,
    [input.planId],
  );
  if (planRows.length === 0) {
    throw new Error(`Team task plan #${input.planId} was not found.`);
  }

  const [agentRows] = await db.query<RowDataPacket[]>(
    `SELECT agent_id FROM team_task_plan_agents WHERE plan_id = ? ORDER BY id LIMIT 1`,
    [input.planId],
  );
  const agentId = agentRows[0] ? Number(agentRows[0].agent_id) : null;
  if (agentId === null) {
    throw new Error("This plan has no assigned agent — cannot create a queue.");
  }

  // Only queue targets that genuinely belong to this plan.
  const [targetRows] = await db.query<RowDataPacket[]>(
    `SELECT id, ip, port FROM team_task_plan_targets
      WHERE plan_id = ? AND id IN (?)`,
    [input.planId, targetIds],
  );
  if (targetRows.length === 0) {
    throw new Error("None of the selected targets belong to this plan.");
  }

  const experimentId =
    Number.isSafeInteger(input.experimentId) && (input.experimentId ?? 0) > 0
      ? Number(input.experimentId)
      : null;

  const params = {
    planId: input.planId,
    targetIds: targetRows.map((r) => Number(r.id)),
    assessmentType: "AUTHORIZED_METADATA_ONLY",
    networkOperationPerformed: false,
  };

  const [queueResult] = await db.query<ResultSetHeader>(
    `INSERT INTO agent_task_queue
       (experiment_id, agent_id, task_name, task_description, params, priority, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', NOW())`,
    [
      experimentId,
      agentId,
      input.taskName?.trim() || `Plan #${input.planId} metadata queue`,
      input.taskDescription?.trim() ||
        "Authorized metadata assessment queue. No network operation performed.",
      JSON.stringify(params),
      Number.isInteger(input.priority) ? input.priority : 0,
    ],
  );

  const queueId = queueResult.insertId;

  // One PENDING item per target.
  const itemValues = targetRows.map((r) => [
    queueId,
    String(r.ip),
    r.port != null ? Number(r.port) : null,
  ]);

  await db.query(
    `INSERT INTO queue_item_results (queue_id, ip_address, port, status, created_at)
     VALUES ${itemValues.map(() => "(?, ?, ?, 'PENDING', NOW())").join(", ")}`,
    itemValues.flat(),
  );

  await db.query(
    `INSERT INTO queue_audit_logs (queue_id, item_id, event_type, actor, reason, created_at)
     VALUES (?, NULL, 'QUEUE_CREATED', 'AGI System Owner', ?, NOW())`,
    [
      queueId,
      `Queue created from plan #${input.planId} with ${targetRows.length} target(s). Metadata only; no network operation.`,
    ],
  );

  return {
    id: queueId,
    planId: input.planId,
    experimentId,
    agentId,
    totalItems: targetRows.length,
    status: "QUEUED",
    assessmentType: "AUTHORIZED_METADATA_ONLY",
    networkOperationPerformed: false,
  };
}

/**
 * Report the real status of a queue from the local DB: queue status plus item
 * counts. No network operation is performed; counts reflect actual rows.
 */
export async function assessQueueLocal(id: number): Promise<QueueAssessment> {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Invalid queue ID.");
  }

  const [queueRows] = await db.query<RowDataPacket[]>(
    `SELECT status FROM agent_task_queue WHERE id = ? LIMIT 1`,
    [id],
  );
  if (queueRows.length === 0) {
    throw new Error(`Queue #${id} was not found.`);
  }

  const [counts] = await db.query<RowDataPacket[]>(
    `SELECT
        COUNT(*) AS total,
        SUM(status = 'SUCCEEDED') AS succeeded,
        SUM(status = 'FAILED') AS failed
      FROM queue_item_results WHERE queue_id = ?`,
    [id],
  );

  const row = counts[0] ?? {};

  return {
    status: String(queueRows[0].status),
    totalItems: Number(row.total ?? 0),
    successfulCount: Number(row.succeeded ?? 0),
    failedCount: Number(row.failed ?? 0),
    networkOperationPerformed: false,
    assessmentType: "AUTHORIZED_METADATA_ONLY",
  };
}

/** One queue item for the live assessment UI. */
export type QueueItemUi = {
  id: number;
  ip: string;
  port: number | null;
  status: string;
};

/** List a queue's items (for the live assessment progress list). */
export async function getQueueItemsForUi(
  queueId: number,
): Promise<QueueItemUi[]> {
  if (!Number.isSafeInteger(queueId) || queueId < 1) {
    throw new Error("Invalid queue id.");
  }
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, ip_address AS ip, port, status
       FROM queue_item_results WHERE queue_id = ? ORDER BY id`,
    [queueId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    ip: String(r.ip),
    port: r.port != null ? Number(r.port) : null,
    status: String(r.status),
  }));
}

export type QueueItemResult = {
  id: number;
  status: "SUCCEEDED" | "FAILED";
  reason: string;
};

/**
 * Assess ONE queue item: a real metadata-completeness validation (NO network
 * operation). Defense-in-depth — only targets that are authorized in
 * remote_authorized_targets are assessed; others are marked FAILED. Updates the
 * row and returns the real result so the UI can show live progress.
 */
export async function validateQueueItem(
  itemId: number,
): Promise<QueueItemResult> {
  if (!Number.isSafeInteger(itemId) || itemId < 1) {
    throw new Error("Invalid item id.");
  }

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, ip_address AS ip, port FROM queue_item_results WHERE id = ? LIMIT 1`,
    [itemId],
  );
  const item = rows[0];
  if (!item) throw new Error("Queue item not found.");

  const ip = String(item.ip);
  const port = item.port != null ? Number(item.port) : null;

  const [auth] = await db.query<RowDataPacket[]>(
    `SELECT 1 FROM remote_authorized_targets WHERE ip = ? AND port = ? AND is_authorized = 1 LIMIT 1`,
    [ip, port],
  );

  if (auth.length === 0) {
    const reason = "not authorized in remote_authorized_targets";
    await db.query(
      `UPDATE queue_item_results SET status = 'FAILED', validation_reason = ?, completed_at = NOW() WHERE id = ?`,
      [reason, itemId],
    );
    return { id: itemId, status: "FAILED", reason };
  }

  // Metadata completeness check — real validation of stored recon data, no network.
  const [meta] = await db.query<RowDataPacket[]>(
    `SELECT service, cves, hostname FROM saved_ports WHERE ip = ? AND port = ? LIMIT 1`,
    [ip, port],
  );
  const m = meta[0];
  const cves = m ? Number(m.cves ?? 0) : 0;
  const hasMeta = Boolean(m && (m.service || cves > 0 || m.hostname));
  const status: "SUCCEEDED" | "FAILED" = hasMeta ? "SUCCEEDED" : "FAILED";
  const reason = hasMeta
    ? `metadata present${m.service ? `: ${m.service}` : ""}${cves > 0 ? `, ${cves} CVEs` : ""}`
    : "incomplete metadata";

  await db.query(
    `UPDATE queue_item_results SET status = ?, validation_reason = ?, completed_at = NOW() WHERE id = ?`,
    [status, reason, itemId],
  );
  return { id: itemId, status, reason };
}

/**
 * Ensure the given saved IP/port targets exist as this plan's targets (so they
 * can be queued), inserting any that are missing. Metadata only — no network.
 * Returns a map of "ip:port" -> team_task_plan_targets.id for every requested
 * target (existing or newly created).
 */
export async function syncPlanTargets(
  planId: number,
  targets: { ip: string; port: number; service?: string | null }[],
): Promise<Record<string, number>> {
  if (!Number.isSafeInteger(planId) || planId < 1) {
    throw new Error("Invalid plan ID.");
  }

  const seen = new Map<
    string,
    { ip: string; port: number; service: string | null }
  >();
  for (const t of Array.isArray(targets) ? targets : []) {
    const ip = String(t?.ip ?? "").trim();
    const port = Number(t?.port);
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) continue;
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    seen.set(`${ip}:${port}`, {
      ip,
      port,
      service: t?.service != null ? String(t.service).slice(0, 60) : null,
    });
  }
  const list = [...seen.values()];
  if (list.length === 0) throw new Error("No valid targets to sync.");
  if (list.length > 500)
    throw new Error("Too many targets (max 500 per sync).");

  const [planRows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM team_task_plans WHERE id = ? LIMIT 1`,
    [planId],
  );
  if (planRows.length === 0)
    throw new Error(`Team task plan #${planId} was not found.`);

  const tuples = (rows: typeof list) => rows.map(() => "(?, ?)").join(", ");
  const tupleParams = (rows: typeof list) =>
    rows.flatMap((t) => [t.ip, t.port]);

  const [existing] = await db.query<RowDataPacket[]>(
    `SELECT id, ip, port FROM team_task_plan_targets
      WHERE plan_id = ? AND (ip, port) IN (${tuples(list)})`,
    [planId, ...tupleParams(list)],
  );
  const map: Record<string, number> = {};
  for (const r of existing) map[`${r.ip}:${Number(r.port)}`] = Number(r.id);

  const missing = list.filter((t) => map[`${t.ip}:${t.port}`] === undefined);
  if (missing.length > 0) {
    await db.query(
      `INSERT INTO team_task_plan_targets (plan_id, target_type, ip, port, service)
       VALUES ${missing.map(() => "(?, 'port', ?, ?, ?)").join(", ")}`,
      missing.flatMap((t) => [planId, t.ip, t.port, t.service]),
    );
    const [after] = await db.query<RowDataPacket[]>(
      `SELECT id, ip, port FROM team_task_plan_targets
        WHERE plan_id = ? AND (ip, port) IN (${tuples(missing)})`,
      [planId, ...tupleParams(missing)],
    );
    for (const r of after) map[`${r.ip}:${Number(r.port)}`] = Number(r.id);
  }

  return map;
}
