# agentmemory hooks (Cursor-native)

`hooks.json` uses **Cursor-native** hook events (`sessionStart`, `beforeSubmitPrompt`, `postToolUse`, `afterFileEdit`, etc.). Cursor loads this format directly — no Claude Code → Cursor conversion (and no `matcher.split` pitfalls).

All events route to `scripts/cursor-hook-bootstrap.mjs`, which on Windows reads Cursor’s hook JSON from a temp file and forwards it to `scripts/cursor-hook.mjs` on stdin. The handler dispatches on `hook_event_name` in the payload.

On Windows, Cursor 3.5.x often does not pipe hook JSON to Node on stdin; the bootstrap and temp-file fallback in `cursor-common.mjs` address that.

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
