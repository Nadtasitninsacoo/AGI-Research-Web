import { query, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedConfig } from "../config/load.js";
import type { Mode } from "../config/schema.js";
import { JobManager } from "../jobs/manager.js";
import type { JobRecord } from "../jobs/types.js";
import type { PermissionGate } from "../permissions/index.js";
import { createJobsServer, JOBS_SERVER, JOBS_TOOLS } from "../tools/jobs-server.js";
import { loadContext } from "./context-loader.js";
import { Inbox } from "./inbox.js";
import { formatReport } from "./report-message.js";
import { loadPrompt } from "./system-prompt.js";

/** Core tools from the SDK. PowerShell is left out so there is one shell to police. */
export const MAIN_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"];

export type SessionEvents = {
  onText: (text: string) => void;
  onToolUse: (name: string, input: unknown) => void;
  onTurnEnd: (info: { costUsd: number; error?: string }) => void;
  onBusyChange: (busy: boolean) => void;
  onJobFinished: (record: JobRecord) => void;
};

export class MainSession {
  readonly inbox = new Inbox();
  readonly jobs: JobManager;
  private readonly q: Query;
  private busy = false;

  constructor(cfg: ResolvedConfig, gate: PermissionGate, mode: Mode, private readonly events: SessionEvents) {
    // A finished job reports back as a tagged, untrusted system message in arrival order.
    this.jobs = new JobManager(cfg, gate.engine, (record) => {
      this.inbox.push(formatReport(record), { synthetic: true });
      this.setBusy(true);
      this.events.onJobFinished(record);
    });
    const append = `${loadPrompt(cfg, "main")}\n\n${loadContext(cfg, mode)}`;
    this.q = query({
      prompt: this.inbox,
      options: {
        model: cfg.models.main,
        effort: cfg.effort,
        cwd: cfg.targetRepo,
        systemPrompt: { type: "preset", preset: "claude_code", append },
        tools: MAIN_TOOLS,
        mcpServers: { [JOBS_SERVER]: createJobsServer(this.jobs) },
        allowedTools: [...MAIN_TOOLS, ...JOBS_TOOLS],
        // The PreToolUse hook decides every call; "ask" falls through to canUseTool.
        permissionMode: "default",
        canUseTool: gate.canUseTool,
        hooks: { PreToolUse: [{ hooks: [gate.hook] }] },
        // Isolation: no ~/.claude or project settings, so only our policy applies.
        settingSources: [],
        ...(process.env.ORCH_DEBUG ? { stderr: (d: string) => process.stderr.write(`[sdk] ${d}`) } : {}),
      },
    });
  }

  send(text: string): void {
    this.setBusy(true);
    this.inbox.push(text);
  }

  async run(): Promise<void> {
    for await (const msg of this.q) this.handle(msg);
  }

  close(): void {
    void this.jobs.stopAll();
    this.inbox.close();
    this.q.close();
  }

  // Messages queued while a turn runs may be answered in that same turn,
  // so "one result per message" doesn't hold. Busy = between activity and a result.
  private setBusy(b: boolean): void {
    if (b === this.busy) return;
    this.busy = b;
    this.events.onBusyChange(b);
  }

  private handle(msg: SDKMessage): void {
    if (process.env.ORCH_DEBUG) console.error(`[msg] ${msg.type}${"subtype" in msg ? `/${msg.subtype}` : ""}`);
    if (msg.type === "assistant" && msg.parent_tool_use_id === null) {
      this.setBusy(true);
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) this.events.onText(block.text);
        else if (block.type === "tool_use") this.events.onToolUse(block.name, block.input);
      }
    } else if (msg.type === "result") {
      const error = msg.subtype === "success" ? undefined : `${msg.subtype}: ${msg.errors.join("; ")}`;
      this.events.onTurnEnd({ costUsd: msg.total_cost_usd, error });
      this.setBusy(false);
    }
  }
}
