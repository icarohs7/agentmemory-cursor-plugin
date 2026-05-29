# agentmemory hooks (Cursor-native)

`hooks.json` uses **Cursor-native** hook events (`sessionStart`, `beforeSubmitPrompt`, `postToolUse`, `afterFileEdit`, etc.). Cursor loads this format directly — no Claude Code → Cursor conversion (and no `matcher.split` pitfalls).

All events route to `scripts/cursor-hook-bootstrap.mjs`, which on Windows reads Cursor’s hook JSON from a temp file and forwards it to `scripts/cursor-hook.mjs` on stdin. The handler dispatches on `hook_event_name` in the payload.

On Windows, Cursor 3.5.x often does not pipe hook JSON to Node on stdin; the bootstrap and temp-file fallback in `cursor-common.mjs` address that.

**Active implementation:** `scripts/cursor-hook.mjs` + `scripts/cursor-common.mjs` (parity with [upstream agentmemory](https://github.com/rohitg00/agentmemory) ~v0.9.24). Legacy per-event `scripts/*.mjs` bundles are not wired by `hooks.json`.

## Project scoping (`resolveProject`)

Observes and session APIs send:

| Field | Value |
|-------|--------|
| `project` | Repo **basename** from git toplevel (or `AGENTMEMORY_PROJECT_NAME`, else cwd basename) — see `scripts/resolve-project.mjs` |
| `cwd` | Full workspace path from the hook payload |

This matches upstream scoping ([#687](https://github.com/rohitg00/agentmemory/pull/687)) so recall and lessons are keyed by project name, not a full `C:\...` path.

## Fire-and-forget vs blocking

Most telemetry uses **`observeFireAndForget`** / **`restFireAndForget`**: the hook starts the HTTP request, schedules `process.exit(0)` after a short delay (500ms default; 1500ms for `sessionEnd`), and does not block the agent ([#688](https://github.com/rohitg00/agentmemory/pull/688)).

| Event | Behavior |
|-------|----------|
| `beforeSubmitPrompt`, `postToolUse`, `postToolUseFailure`, `afterFileEdit`, shell/MCP, subagent start/stop | Fire-and-forget observe |
| `stop` | Fire-and-forget `/summarize` only |
| `sessionEnd` | Fire-and-forget `/session/end`, optional consolidation + bridge |
| `sessionStart` | Fire-and-forget `/session/start` **unless** inject is on (see below) |
| `preToolUse` | **Blocking** only when inject is on (stdout enrich) |
| `preCompact` | **Blocking** (stdout context injection) |

## Context injection (default off)

**`AGENTMEMORY_INJECT_CONTEXT` is unset/false by default.** When off:

- `sessionStart` registers the session without waiting for or writing context.
- `preToolUse` does not call `/enrich`.

Set `AGENTMEMORY_INJECT_CONTEXT=true` to restore upstream-style injection on session start and file-oriented tools (case-insensitive tool names: read, write, grep, glob, task, shell, etc.).

## Session lifecycle (stop vs sessionEnd)

- **`stop`** → `POST /agentmemory/summarize` (non-blocking).
- **`sessionEnd`** → `POST /agentmemory/session/end`, then optional crystals/pipeline/bridge when env vars are set.

Both hooks are wired in `hooks.json`; summarize and session end are intentionally split (upstream `stop.ts` / `session-end.ts`).

## Claude-only events (handlers ready, not in `hooks.json`)

[Cursor’s hook list](https://cursor.com/docs/agent/hooks) does not include `notification` or `taskCompleted` ([third-party mapping](https://cursor.com/docs/reference/third-party-hooks): Claude `Notification` and `TaskCompleted` are unsupported). `cursor-hook.mjs` still implements them for Kimi (`kimi/kimi-hook.mjs`) or if Cursor adds these events later:

| Event | Behavior |
|-------|----------|
| `notification` | Observes only `permission_prompt` (`notification_type` or `notificationType`) → `hookType: "notification"` |
| `taskCompleted` | Task metadata → `hookType: "task_completed"` |

Do not add these keys to `hooks.json` until Cursor documents them; task completion in Cursor is covered by the `stop` hook (with `status`).

## Claude Code format (backup)

`hooks.claude.json` is the previous Claude Code marketplace layout. Keep it for reference or if you copy this plugin back to Claude Code; Cursor should use `hooks.json` only.

## Optional environment variables

| Variable | Effect |
|----------|--------|
| `AGENTMEMORY_URL` | Backend URL (default `http://localhost:3111`) |
| `AGENTMEMORY_SECRET` | Bearer token when required |
| `AGENTMEMORY_INJECT_CONTEXT=true` | Inject memory context on `sessionStart` and file tools on `preToolUse` |
| `AGENTMEMORY_HOOK_DEBUG=false` | Turn off `[agentmemory]` trace lines in the hooks log (on by default) |
| `CONSOLIDATION_ENABLED=true` | Run consolidation on `sessionEnd` |
| `CLAUDE_MEMORY_BRIDGE=true` | Sync with Claude `MEMORY.md` on compact/end |

After editing hooks, reload the Cursor window.

## Debug traces

Hook scripts log to **stderr** as `[agentmemory] …` so stdout stays free for hook JSON. View them in the latest `cursor.hooks.*.log` under `%APPDATA%\Cursor\logs\<session>\...\output_...\` in the **STDERR** section for each hook run.
