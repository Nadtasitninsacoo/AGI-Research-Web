---
name: modes-persist
description: the chosen mode must survive refresh/restart until a human changes it
type: feedback
---

The operator asked for two modes — `auto` (proceed without a human) and `approve` (wait for human
approval) — and that whichever is selected must not be lost on refresh or shutdown, until a human
switches it themselves.

**Why:** modes govern how much the team does unattended; losing the setting could silently switch a
team from supervised to autonomous or back.

**How to apply:** the current mode lives in `state/runtime-state.json`, written only by a human action
(`/mode`). The config's `mode` is just the first-run default. See [[modes-persist]] decisions in PROGRESS.md.
