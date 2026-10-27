import { randomBytes } from "node:crypto";

/** Sortable, filesystem-safe id for one CLI run: 2026-10-27T04-12-09-a1b2. */
export function newRunId(now = new Date()): string {
  return `${now.toISOString().slice(0, 19).replace(/:/g, "-")}-${randomBytes(2).toString("hex")}`;
}
