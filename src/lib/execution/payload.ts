import type { RunMode } from "./types";

/** สร้าง params สำหรับ POST runs — โครงสร้างเหมือนโค้ดเดิมทุกประการ */
export function buildRunParams(
  runMode: RunMode,
  params: Record<string, unknown>,
  coordinatorAgentId: string,
  memberAgentIds: string[],
): Record<string, unknown> {
  if (runMode !== "team") return params;

  return {
    ...params,
    orchestration: {
      mode: "team",
      strategy: "plan_then_execute",
      coordinatorAgentId,
      memberAgentIds,
      workflow: [
        "planning",
        "task_assignment",
        "agent_discussion",
        "result_review",
        "final_synthesis",
      ],
    },
  };
}
