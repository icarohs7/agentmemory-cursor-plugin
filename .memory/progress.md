# Hook parity progress

Track execution of [.memory/plan.md](./plan.md). Update this file **after each step** is reviewed and committed.

**Upstream target:** [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) `main` (~v0.9.24 hook behavior)  
**Active implementation:** `scripts/cursor-common.mjs`, `scripts/cursor-hook.mjs`, `hooks/hooks.json`

---

## Status legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Done (committed) |
| ⏭️ | Skipped (with reason) |
| ❌ | Blocked |

---

## Steps

| Step | Title | Status | Commit | Notes |
|------|--------|--------|--------|-------|
| 1 | Project scoping (`resolveProject`) | ✅ | 7296392 | `resolve-project.mjs`; `observeBase` uses basename |
| 2 | Session ID fallbacks | ✅ | 3eb6512 | `sessionId`: session_id → sessionId → conversation_id |
| 3 | Fire-and-forget telemetry helper | ✅ | a1cbb15 | `observeFireAndForget` in cursor-common.mjs |
| 4 | Non-blocking session register (no inject) | ✅ | ae9db7a | `postSessionStart` fire-and-forget when inject off |
| 5 | Prompt submit parity | ✅ | 0b6d3f1 | userPrompt fallback + observeFireAndForget |
| 6 | Post-tool-use parity | ✅ | 7af4a52 | toolOutput + observeFireAndForget |
| 7 | Post-tool-failure parity | ✅ | 1235b0d | isInterrupt, aliases, observeFireAndForget |
| 8 | Pre-tool enrich parity | ✅ | ee4b3e1 | case-insensitive tools, toolArgs, project in enrich |
| 9 | Pre-compact context parity | ✅ | `9fe38d2` | budget 1500; 5s timeout |
| 10 | Stop + session end lifecycle | ✅ | `5ab8ef6` | Option B: summarize on stop; end on sessionEnd |
| 11 | Subagent + shell/MCP/file-edit observes | ✅ | `feacd6c` | fire-and-forget + upstream subagent aliases |
| 12 | Notification + task completed | ✅ | `49d70bd` | Handlers only; not in hooks.json (Cursor N/A) |
| 13 | Kimi adapter touch-up | ✅ | `8ff83d2` | Slim tool map + field aliases + README |
| 14 | Docs + version bump | ✅ | `0d9c301` | hooks README + plugin 0.9.24 + root README |
| 15 | Cleanup stale per-hook scripts | ✅ | `244e276` | Removed 14 legacy bundles; scripts/README.md |

---

## Current focus

**Plan complete (2026-05-23).** All steps 1–15 committed on `master` (through `244e276`).

**Next upstream sync:** Diff [agentmemory `src/hooks/`](https://github.com/rohitg00/agentmemory/tree/main/src/hooks) against `scripts/cursor-hook.mjs` / `cursor-common.mjs`; add new steps to this file if needed.

---

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-23 | Step 10: **Option B** — summarize on `stop` only; `/session/end` + consolidation on `sessionEnd` | Matches upstream split; avoids duplicate session/end |
| 2026-05-23 | Step 12: handlers only; **no** `hooks.json` entries | Cursor docs omit `notification` / `taskCompleted`; use `stop` for task end |

---

## Session log

```
2026-05-23 — Steps 1–15 completed (7296392 … 244e276): Cursor-native hook parity with upstream ~v0.9.24
2026-05-23 — Step 10 Option B; Step 12 handlers-only; Step 15 removed 14 legacy scripts/*.mjs
2026-05-23 — plan.md + progress.md committed for future upstream resyncs
```
