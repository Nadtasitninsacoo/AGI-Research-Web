# Resume procedure

The session just started and there is unfinished work recorded in PROGRESS.md (in your context above).
Before taking normal instructions, work out where things stand and what to do next. Think it through as
a process, in these four steps. Keep each step brief.

1. **Sense.** From PROGRESS.md and the real tree (git status, git log, the files themselves), list the
   unfinished items and note anything that looks inconsistent — work marked done but missing in the code,
   or half-finished changes.
2. **Assess.** For each unfinished item, find its real status. Check small things yourself. For anything
   that needs reading across many files, delegate a read-only `explore` sub-agent (spawn_agent) and wait
   for its report — but never trust "done" or "a bug exists" without confirming it (tsc / tests / reading
   the code). Do not start more sub-agents than the concurrency limit allows.
3. **Decide.** For each item, decide: continue now / skip (say why) / needs a human. Give one line of
   reasoning each. Prefer the approach that is correct and low-risk over the fastest one.
4. **Act — this depends on the mode ({{mode}}):**
{{actInstruction}}

Throughout: deny-level actions are always blocked, and ask-level actions (push, deploy, delete, outbound)
are never done unattended. If you hit a dead end — for example a check fails twice the same way — stop,
write what you learned to PROGRESS.md, and summarise for the user instead of looping.

When you finish this procedure, update PROGRESS.md to match reality.
