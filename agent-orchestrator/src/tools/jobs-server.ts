import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { briefSchema } from "../jobs/brief-schema.js";
import type { JobManager } from "../jobs/manager.js";
import { JOB_TYPES } from "../jobs/types.js";

export const JOBS_SERVER = "jobs";
/** Tool ids the main agent must be allowed to call. */
export const JOBS_TOOLS = ["spawn_agent", "list_jobs", "send_message", "stop_job"].map((t) => `mcp__${JOBS_SERVER}__${t}`);

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

/** Exposes delegation to the main agent. One manager backs every tool here. */
export function createJobsServer(jobs: JobManager): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: JOBS_SERVER,
    version: "0.1.0",
    tools: [
      tool(
        "spawn_agent",
        "Delegate read-only investigation to a background sub-agent. Returns a jobId immediately; the report arrives later as a tagged system message. Use for independent work; do small or sequential tasks yourself.",
        { type: z.enum(JOB_TYPES), brief: briefSchema, background: z.boolean().default(true) },
        async ({ type, brief }) => {
          const r = jobs.spawn(type, brief);
          return text(r.ok ? `started ${r.jobId}` : `could not start: ${r.error}`);
        },
      ),
      tool("list_jobs", "List background jobs and their status.", {}, async () => text(JSON.stringify(jobs.list(), null, 2))),
      tool(
        "send_message",
        "Send a follow-up message to a running job.",
        { jobId: z.string(), text: z.string() },
        async ({ jobId, text: msg }) => {
          const r = jobs.send(jobId, msg);
          return text(r.ok ? `sent to ${jobId}` : (r.error ?? "failed"));
        },
      ),
      tool("stop_job", "Stop a running job.", { jobId: z.string() }, async ({ jobId }) => {
        const r = await jobs.stop(jobId);
        return text(r.ok ? `stopped ${jobId}` : (r.error ?? "failed"));
      }),
    ],
  });
}
