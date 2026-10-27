import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Push-based queue fed to `query({ prompt })` as streaming input.
 * User messages and (later) job events both go through here, so the
 * agent sees them in arrival order.
 */
export class Inbox implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = [];
  private waiters: ((r: IteratorResult<SDKUserMessage>) => void)[] = [];
  private closed = false;

  push(text: string, opts: { synthetic?: boolean } = {}): void {
    if (this.closed) return;
    const msg: SDKUserMessage = {
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      ...(opts.synthetic ? { isSynthetic: true } : {}),
    };
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: msg, done: false });
    else this.queue.push(msg);
  }

  close(): void {
    this.closed = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const msg = this.queue.shift();
        if (msg) return Promise.resolve({ value: msg, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}
