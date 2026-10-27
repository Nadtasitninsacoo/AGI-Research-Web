import { query, type Options, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Inbox } from "../session/inbox.js";
import { renderBrief, type Brief } from "./brief-schema.js";
import type { JobRecord, JobType } from "./types.js";

/** Truncate a report that overshot the brief's line limit, so context stays bounded. */
function clampLines(text: string, max: number): string {
  const lines = text.split("\n");
  return lines.length <= max ? text : lines.slice(0, max).join("\n") + `\n…(report truncated at ${max} lines)`;
}

/**
 * One background job: a streaming-input query() restricted to its agent type.
 * Collects the final report and cost, and can take follow-up messages or be stopped.
 */
export class Job {
  readonly record: JobRecord;
  private readonly inbox = new Inbox();
  private readonly q: Query;

  constructor(id: string, type: JobType, brief: Brief, options: Options) {
    this.record = { id, type, status: "running", brief, startedAt: Date.now(), costUsd: 0 };
    this.q = query({ prompt: this.inbox, options });
    this.inbox.push(renderBrief(brief));
  }

  /** Runs to completion, then returns the finished record. Never throws; errors land in the record. */
  async run(): Promise<JobRecord> {
    let lastText = "";
    try {
      for await (const msg of this.q as AsyncIterable<SDKMessage>) {
        if (msg.type === "assistant" && msg.parent_tool_use_id === null) {
          for (const b of msg.message.content) if (b.type === "text" && b.text.trim()) lastText = b.text;
        } else if (msg.type === "result") {
          this.record.costUsd = msg.total_cost_usd;
          if (msg.subtype === "success") this.finish("done", clampLines(msg.result || lastText, this.record.brief.reportMaxLines));
          else if (this.record.status === "running") this.finish("error", `${msg.subtype}: ${msg.errors.join("; ")}`);
          break;
        }
      }
    } catch (err) {
      if (this.record.status === "running") this.finish("error", err instanceof Error ? err.message : String(err));
    }
    if (this.record.status === "running") this.finish("error", "job ended without a result");
    return this.record;
  }

  send(text: string): void {
    this.inbox.push(text);
  }

  async stop(): Promise<void> {
    if (this.record.status !== "running") return;
    this.finish("stopped", "stopped by the main agent");
    await this.q.interrupt().catch(() => {});
    this.inbox.close();
  }

  private finish(status: JobRecord["status"], report: string): void {
    this.record.status = status;
    this.record.report = report;
    this.record.endedAt = Date.now();
  }
}
