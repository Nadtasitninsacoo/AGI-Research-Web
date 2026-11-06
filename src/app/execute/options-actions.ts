"use server";

import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import type { ExecutionOptions } from "@/lib/execution/types";

/**
 * Read the agents and experiments for the execute page directly from the local
 * DB. Replaces the calls to the retired :3001 backend (/api/research/agents,
 * /api/research/experiments) so the page works once :3001 is stopped.
 */
export async function listExecutionOptions(): Promise<ExecutionOptions> {
  const [[agentRows], [expRows]] = await Promise.all([
    db.query<RowDataPacket[]>(
      `SELECT id, name, status FROM agents WHERE status <> 'retired' ORDER BY id`,
    ),
    db.query<RowDataPacket[]>(`SELECT id, name FROM experiments ORDER BY id`),
  ]);

  return {
    agents: agentRows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      status: r.status != null ? String(r.status) : undefined,
    })),
    experiments: expRows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
    })),
  };
}
