# Hook parity plan (upstream agentmemory → Cursor port)

Goal: Port **hook behavior** from [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) `main` (~v0.9.24) into this repo’s **active** path (`scripts/cursor-common.mjs`, `scripts/cursor-hook.mjs`, `hooks/hooks.json`). Each step is one reviewable commit.

**Out of scope for this plan:** OpenCode in-process plugin, server-side defaults (`CONSOLIDATION_ENABLED` auto-on), MCP/skills. (Kimi adapter and stale-script cleanup were steps 13–15.)

**Status:** Steps 1–15 completed May 2026 — see [.memory/progress.md](./progress.md) for commits. Re-run this plan when upstream [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) hook behavior changes; compare `src/hooks/` on their `main` to `scripts/cursor-hook.mjs`.

**Reference:** Upstream sources under `plugin/scripts/` and `src/hooks/` (especially `_project.ts`, `post-tool-use.ts`, `session-start.ts`, `stop.ts`, `session-end.ts`).

---

## Step 1 — Project scoping (`resolveProject`)

**Why:** Upstream sends repo **basename** as `project`, full path as `cwd`. Fixes recall/lesson scoping ([#687](https://github.com/rohitg00/agentmemory/pull/687)).

**Changes:**

- Add `scripts/resolve-project.mjs` (port of `src/hooks/_project.ts`) **or** inline in `cursor-common.mjs`.
- Update `observeBase()`:
  - `cwd` = `projectRoot(payload)` (unchanged: full workspace path).
  - `project` = `resolveProject(cwd)`.
- Update `postSessionStart` body to use the same `project` / `cwd` split.

**Verify:**

- Hook debug log shows `project=agentmemory-cursor-plugin` (basename), not a full `C:\...` path.
- `/observe` payloads in backend use basename for `project`.

**Files:** `scripts/cursor-common.mjs` (+ optional `scripts/resolve-project.mjs`)

---

## Step 2 — Session ID fallbacks

**Why:** Upstream accepts `session_id` and `sessionId`; Cursor also uses `conversation_id`.

**Changes:**

- In `sessionId(payload)`: `session_id || sessionId || conversation_id || fallback`.

**Verify:**

- Sessions still attach when only `conversation_id` is present (existing Cursor behavior preserved).

**Files:** `scripts/cursor-common.mjs`

---

## Step 3 — Fire-and-forget telemetry helper

**Why:** Telemetry hooks should not block the agent ([#688](https://github.com/rohitg00/agentmemory/pull/688)).

**Changes:**

- Add `observeFireAndForget(body, { timeoutMs, exitMs })` in `cursor-common.mjs`:
  - Unawaited `fetch` + `.catch(() => {})`.
  - Optional `setTimeout(() => process.exit(0), exitMs).unref()` (500ms default; 1500ms for multi-fetch steps).
- Keep `postObserve()` (await) for now; migrate callers in Step 4+.

**Verify:**

- Helper exists and is unit-tested manually (one hook run returns quickly even if backend is down).

**Files:** `scripts/cursor-common.mjs`

---

## Step 4 — Non-blocking session register (no inject)

**Why:** When `AGENTMEMORY_INJECT_CONTEXT` is not `true`, `/session/start` should not block startup.

**Changes:**

- In `postSessionStart()`:
  - `inject === false` → fire-and-forget fetch (800ms timeout), no stdout read.
  - `inject === true` → keep await + stdout context (1500ms).

**Verify:**

- With inject off: session still registers; startup feels instant.
- With inject on: context still appears on first turn.

**Files:** `scripts/cursor-common.mjs`

---

## Step 5 — Prompt submit parity

**Changes:**

- `handleBeforeSubmitPrompt`: `prompt = payload.prompt ?? payload.userPrompt`.
- Switch to `observeFireAndForget` (500ms exit).

**Verify:**

- Prompts recorded when either field is sent.

**Files:** `scripts/cursor-hook.mjs`, `scripts/cursor-common.mjs`

---

## Step 6 — Post-tool-use parity

**Changes:**

- Add `toolOutput(payload)` in `cursor-common.mjs` (port upstream: `tool_response`, `tool_output`, `tool_result` / `toolResult`, nested `text_result_for_llm`).
- `handlePostToolUse`:
  - `tool_name ?? toolName`, `tool_input ?? toolArgs`.
  - Use `toolOutput()` before `extractImageData`.
  - `observeFireAndForget`; keep extra Cursor fields (`duration`, `tool_use_id`) if present.

**Verify:**

- Tool results still observed when payload uses `tool_result` shape.

**Files:** `scripts/cursor-common.mjs`, `scripts/cursor-hook.mjs`

---

## Step 7 — Post-tool-failure parity

**Changes:**

- Skip when `is_interrupt || isInterrupt`.
- `tool_input ?? toolArgs`, `error ?? errorMessage`.
- `observeFireAndForget`.

**Verify:**

- Interrupts do not create failure observations.

**Files:** `scripts/cursor-hook.mjs`, `scripts/cursor-common.mjs`

---

## Step 8 — Pre-tool enrich parity (inject on only)

**Changes:**

- Early return when `!AGENTMEMORY_INJECT_CONTEXT` (before heavy work).
- Case-insensitive tool check: `edit`, `write`, `create`, `read`, `view`, `glob`, `grep` (+ keep Cursor extras: `task`, `shell`, `webfetch`, `websearch` if desired).
- `tool_input ?? toolArgs`; grep keys `path`, `file` (match upstream).
- Pass `project` in `/enrich` body when available (`resolveProject` from cwd).
- Stay **blocking** (stdout injection).

**Verify:**

- Enrich works for `Write` and `write`; does nothing when inject env unset.

**Files:** `scripts/cursor-hook.mjs`

---

## Step 9 — Pre-compact context parity

**Changes:**

- `/context` body: `project: resolveProject(cwd)`, add `budget: 1500`.
- Remove redundant full-path `project` from `observeBase` usage here.
- Keep bridge sync + stdout write **blocking**.

**Verify:**

- Compact still injects context; backend receives budget.

**Files:** `scripts/cursor-hook.mjs`, `scripts/cursor-common.mjs`

---

## Step 10 — Stop + session end (lifecycle)

**Changes:**

- `handleStop`: fire-and-forget `/summarize` (120s timeout on fetch, don’t await).
- **Policy (chosen): Option B** — only summarize on `stop`; keep `/session/end` on `sessionEnd` only (matches upstream `stop.ts` / `session-end.ts` split).
- `handleSessionEnd`: fire-and-forget `/session/end`, consolidation, bridge; `exitMs: 1500`.

**Verify:**

- Session ends trigger summarize + graph pipeline on backend (check agentmemory logs/viewer).
- No double-consolidation if both events fire (if Option A, confirm idempotency).

**Files:** `scripts/cursor-hook.mjs`, `scripts/cursor-common.mjs`

---

## Step 11 — Subagent + shell/MCP/file-edit observes

**Changes:**

- Subagent start/stop: field aliases (`agentName`, `agentDisplayName`, etc.); fire-and-forget.
- `handleAfterFileEdit`, shell, MCP handlers: use `observeBase` (already has `resolveProject` from Step 1); switch to fire-and-forget.

**Verify:**

- Subagent and edit events still appear in observations.

**Files:** `scripts/cursor-hook.mjs`

---

## Step 12 — Notification + task completed (if Cursor supports)

**Changes:**

- Add handlers in `cursor-hook.mjs`:
  - **Notification:** only `permission_prompt` / equivalent → `hookType: "notification"`.
  - **TaskCompleted:** task metadata → `hookType: "task_completed"`.
- Wire in `hooks/hooks.json` **only if** Cursor exposes matching events — **confirmed N/A** ([Cursor hooks](https://cursor.com/docs/agent/hooks); use `stop` for task completion). Handlers live in `cursor-hook.mjs`; Kimi maps `Notification` / `TaskCompleted` in `kimi/kimi-hook.mjs`.

**Verify:**

- `/hooks` or Cursor hook log shows commands running; observations created.

**Files:** `scripts/cursor-hook.mjs`, `hooks/hooks.json` (conditional)

---

## Step 13 — Kimi adapter touch-up (optional, small)

**Changes:**

- After Step 8, simplify or document tool mapping in `kimi/kimi-hook.mjs` (case handling may move to cursor-hook).

**Files:** `kimi/kimi-hook.mjs`, `kimi/README.md`

---

## Step 14 — Docs + version bump (optional)

**Changes:**

- `hooks/README.md`: document fire-and-forget, `resolveProject`, inject default off.
- `.cursor-plugin/plugin.json`: bump version / changelog note aligned with upstream 0.9.24 behavior.

**Files:** `hooks/README.md`, `.cursor-plugin/plugin.json`, root `README.md`

---

## Step 15 — Cleanup stale per-hook scripts (optional)

**Why:** `scripts/session-start.mjs`, etc. are not used by `hooks.json` and drift from upstream.

**Changes:**

- Either remove them or add a note in README pointing to `cursor-hook.mjs` as sole entrypoint.

**Files:** `scripts/*.mjs` (except cursor-*), `hooks/README.md`

---

## Execution order

```
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15
```

Steps **1–2** are foundational. Step **3** enables **5–7, 11**. Steps **4, 8, 9** stay blocking by design. Step **10** used **Option B** (summarize on `stop` only). Step **12** added handlers but not `hooks.json` entries (Cursor N/A).

---

## Per-step checklist (for PR / review)

- Diff is limited to the step’s files
- `node --check` on edited `.mjs` files
- Manual hook run or one Cursor session with `AGENTMEMORY_HOOK_DEBUG` on
- Update `.memory/progress.md`
- Commit with message: `hook parity step N: <short title>`

