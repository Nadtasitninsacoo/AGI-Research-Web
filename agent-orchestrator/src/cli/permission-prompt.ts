import type { Asker, PermissionRequest } from "../permissions/index.js";
import { dim, summarize, yellow, type Terminal } from "./terminal.js";

type Pending = { req: PermissionRequest; resolve: (ok: boolean) => void };

const YES = /^(y|yes|ใช่|ได้|อนุญาต)$/i;

/**
 * Turns permission requests into y/N questions in the chat terminal.
 * Requests that arrive together (parallel tool calls) are asked one at a time.
 */
export class PermissionPrompter {
  private readonly queue: Pending[] = [];

  constructor(
    private readonly term: Terminal,
    private readonly restorePrompt: () => void,
  ) {}

  get open(): boolean {
    return this.queue.length > 0;
  }

  readonly ask: Asker = (req, signal) =>
    new Promise((resolve) => {
      const item = { req, resolve };
      this.queue.push(item);
      signal.addEventListener("abort", () => this.settle(item, false), { once: true });
      if (this.queue.length === 1) this.show();
    });

  /** Feed a typed line. Returns false when no question is open. */
  answer(line: string): boolean {
    const item = this.queue[0];
    if (!item) return false;
    this.settle(item, YES.test(line.trim()));
    return true;
  }

  private settle(item: Pending, ok: boolean): void {
    const i = this.queue.indexOf(item);
    if (i < 0) return;
    this.queue.splice(i, 1);
    item.resolve(ok);
    if (i === 0) this.term.print(dim(ok ? "  ✓ อนุญาต" : "  ✗ ปฏิเสธ"));
    if (this.queue.length) this.show();
    else this.restorePrompt();
  }

  private show(): void {
    const { req } = this.queue[0];
    this.term.print(yellow(`? ขออนุญาต ${req.tool}: ${summarize(req.input, 300)}`));
    this.term.print(dim(`  เหตุผล: ${req.reason} (${req.ruleId})`));
    this.term.setPrompt(yellow("อนุญาต? [y/N] "));
  }
}
