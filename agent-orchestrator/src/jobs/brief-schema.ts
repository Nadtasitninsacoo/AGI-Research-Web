import { z } from "zod";

/**
 * The contract the main agent must fill to delegate work. Validated before a
 * job starts, so a vague or unbounded brief is rejected with a readable error
 * instead of a sub-agent wandering off.
 */
export const briefSchema = z.object({
  /** What the sub-agent must achieve, in one or two sentences. */
  goal: z.string().min(10),
  /** Paths the job may touch (globs, relative to the repo). Read scope for explore; write scope for worker. */
  allowedPaths: z.array(z.string().min(1)).min(1),
  /** Explicit don'ts. */
  prohibitions: z.array(z.string()).default([]),
  /** What is already known or ruled out, so the job doesn't redo it. */
  known: z.array(z.string()).default([]),
  /** How the job (and the main agent) can check the result is right. */
  verify: z.string().min(3),
  /** The shape the report should take. */
  reportFormat: z.string().min(3),
  /** Hard cap on report length, to protect the main agent's context. */
  reportMaxLines: z.number().int().positive().max(200).default(40),
});

export type Brief = z.infer<typeof briefSchema>;

export function parseBrief(raw: unknown): { ok: true; brief: Brief } | { ok: false; error: string } {
  const r = briefSchema.safeParse(raw);
  return r.success ? { ok: true, brief: r.data } : { ok: false, error: z.prettifyError(r.error) };
}

/** Rendered into the sub-agent's first message so it works strictly within the brief. */
export function renderBrief(brief: Brief): string {
  const list = (label: string, items: string[]) => (items.length ? `\n${label}:\n${items.map((i) => `- ${i}`).join("\n")}` : "");
  return [
    `Goal: ${brief.goal}`,
    `Paths you may work in: ${brief.allowedPaths.join(", ")}`,
    list("Already known / ruled out", brief.known),
    list("Do not", brief.prohibitions),
    `\nHow to verify: ${brief.verify}`,
    `\nReport back in this format (max ${brief.reportMaxLines} lines):\n${brief.reportFormat}`,
  ]
    .filter(Boolean)
    .join("\n");
}
