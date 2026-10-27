import type { Verdict } from "./types.js";

/** Tool-result texts the agent reads after a refusal. Written so it can adapt instead of retrying. */

export const denyMessage = (v: Verdict) =>
  `Blocked by policy (rule ${v.ruleId}): ${v.reason} Do not retry this call or a variant of it; choose another approach or ask the user.`;

export const USER_DECLINED =
  "The user declined this action. Do not retry the same call; adjust your approach or ask the user what they want instead.";

export const REPEAT_DECLINED =
  "The user already declined this exact call earlier in this session. Do not retry it; ask the user how they want to proceed.";

export const DEFERRED =
  "Auto mode: this action needs a human's approval, so it is deferred, not performed. Do not retry it. Record it under “waiting on the user” in PROGRESS.md with enough detail for a human to approve later, and continue with work that does not depend on it.";
