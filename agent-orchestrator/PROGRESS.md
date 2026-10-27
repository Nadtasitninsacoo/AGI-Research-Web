# PROGRESS

Status of the agent-orchestrator build. The agent reads this before answering "what's left".
Keep it short: move items between sections, don't delete history-worth decisions.

## Done and verified
- **Step 1 — Core tools + permissions + chat CLI.** SDK tools (Read/Write/Edit/Glob/Grep/Bash) behind a
  policy engine with allow/ask/deny, built-in rules + config rules, audit log (JSONL), and a y/N prompt in
  the CLI. `npm run check` clean; live scenario `smoke:1` passes (secret refused, force-push-to-main denied,
  normal push asks then stops on "no", README prompt-injection ignored).

- **Step 2 — Memory + modes.** Two modes (`approve` / `auto`) persisted in `state/runtime-state.json` so the
  choice survives restarts until a human changes it (`/mode`); auto mode defers ask-actions instead of
  self-approving; memory store (frontmatter + INDEX), PROGRESS.md and AGENTS.md loaded into the system prompt
  at session start. Unit tests pass. Live scenario (fresh session answers "what's left") NOT yet run.
- **Step 3 — explore sub-agents + background jobs + Resume Loop.** JobManager runs read-only `explore` jobs as
  detached `query()`s with their own model/turns/budget; concurrency limit; `spawn_agent` / `list_jobs` /
  `send_message` / `stop_job` exposed to the main agent via an in-process MCP server; finished jobs report back
  as tagged, untrusted system messages. Resume Loop (Sense→Assess→Decide→Act) injected at session start and via
  `/resume`, mode-aware (approve: plan then stop; auto: continue). 51 unit tests pass (JobManager covered with a
  fake, no model). Live scenario `smoke:3` (two parallel explore agents) NOT yet run — costs money.

- **Step 4 — worker sub-agents + path locks.** `worker` job type can read/search/edit and run read-only
  checks; every write is confined to the brief's allowedPaths and takes a cross-job file lock (LockManager),
  so two workers never touch one file and a worker can't edit outside its scope or escape the repo; secrets and
  ask-level actions stay blocked unattended. Per-job token budget + concurrency were already enforced. 58 unit
  tests pass (locks, worker/explore hooks, manager). Live scenario `smoke:4` (two parallel workers, scoped) NOT
  yet run — costs money.

- **Admin outbound kill switch.** A persisted, human-controlled switch (`/outbound block|allow`, stored in
  state/ beside the mode, first-run default `security.blockExternalUrls`). `block` = hard-deny any shell command
  that reaches a URL outside this machine/private network (curl/wget/Invoke-WebRequest/bare domains), read live
  so it applies without restart; `allow` = such commands are ask (approve mode prompts, auto mode defers — auto
  never prompts). Local/loopback/RFC-1918 calls are never treated as external. Covered by network/switch tests.

## In progress
- Nothing mid-edit. Next: run the pending live scenarios, or start step 5.

## Remaining
- Step 5 — Hooks (before/after tool, job log) + long-output truncation to scratchpad.
- Step 6 — Skills (`use_skill`) + tool search.
- Step 7 — MCP: CAR API (read-only first), then HR API, Teams notify.
- Step 8 — Full scenario suite.

## Waiting on the user
- Step 7 credentials / endpoints for CAR API, HR API and Teams (needed only when step 7 starts).

## Decisions
- 2026-10-27: Two modes, `approve` (default) and `auto`. In both, `deny` rules are absolute and `ask`-level
  actions (push/deploy/delete/outbound) never run unattended — auto mode defers them for a human. Mode is
  persisted and only a human changes it.
- 2026-10-27: Write the JobManager ourselves rather than use the SDK `Agent` tool, to control path locks,
  per-job budgets, brief schema and report tagging.
