import path from "node:path";

/** Canonical key for a path, so "./a.ts" and "a.ts" and backslashes all collide. */
function key(p: string): string {
  const abs = path.resolve(p).replace(/\\/g, "/");
  return process.platform === "win32" ? abs.toLowerCase() : abs;
}

/**
 * One writer per file across all jobs. A worker acquires a file's lock the
 * first time it writes to it and holds it until the job ends; another job
 * asking for the same file is refused, so two workers never edit one file.
 */
export class LockManager {
  private readonly holder = new Map<string, string>();

  /** Grant the lock to jobId, unless another job holds it. Idempotent for the same holder. */
  acquire(jobId: string, filePath: string): { ok: true } | { ok: false; heldBy: string } {
    const k = key(filePath);
    const held = this.holder.get(k);
    if (held && held !== jobId) return { ok: false, heldBy: held };
    this.holder.set(k, jobId);
    return { ok: true };
  }

  /** Release every lock a finished job held. */
  releaseAll(jobId: string): void {
    for (const [k, owner] of this.holder) if (owner === jobId) this.holder.delete(k);
  }

  heldBy(filePath: string): string | undefined {
    return this.holder.get(key(filePath));
  }
}
