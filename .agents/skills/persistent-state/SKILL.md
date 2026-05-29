---
name: persistent-state
description: >
  Manage persistent memory and state across sessions. Use at the start of
  non-trivial tasks, when updating .memory/ files, handing off work, after
  human corrections, when conversation context is long or degrading, or when
  tool output is truncated.
---

## Memory Protocol

At the start of **non-trivial tasks**, call `memory_smart_search` with the task
keywords to retrieve relevant context from previous sessions.

When capturing **decisions, patterns, or preferences** worth keeping across
sessions, use `memory_save` or `memory_lesson_save`.

> Chat history is not durable memory. Rely on the memory system for
> cross-session persistence.

## Memory Files

On session start, read these files when they exist. As work progresses, keep
them accurate.

| File | Purpose |
|------|---------|
| `.memory/agents.md` | Active agents, MCPs, tech stack, tooling |
| `.memory/plan.md` | Macro design and vertical slices |
| `.memory/progress.md` | Atomic task checklist and current status |
| `.memory/verify.md` | Definition of done and required checks |
| `.memory/gotchas.md` | Mistakes already corrected by the human |

**If the files do not exist, initialize them before substantive work.**

## Context management

- After **long conversations**, re-read relevant files before editing — do not
  rely on stale summaries from earlier in the thread.
- If context is **degrading** or you are about to **hand off** (compact,
  new session, another agent), write current state to `.memory/progress.md`:
  done, in progress, blocked, and the next concrete step.
- For **large files**, read focused chunks (`offset` / `limit`) instead of one
  huge read.
- If **tool output is truncated**, read the saved full output file or rerun a
  narrower command before acting on partial data.

## Self-correction

- After any **correction from the human**, add the pattern to
  `.memory/gotchas.md` so it is not repeated.
- If a **fix fails twice**, stop. Re-read the relevant code top-down, state
  which assumption was wrong, then try again with a revised approach.
- When asked to **test your own output**, walk a new-user path through the
  feature — not only static code inspection.
