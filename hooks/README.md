# agentmemory hooks (Cursor-native)

`hooks.json` uses **Cursor-native** hook events (`sessionStart`, `beforeSubmitPrompt`, `postToolUse`, `afterFileEdit`, etc.). Cursor loads this format directly — no Claude Code → Cursor conversion (and no `matcher.split` pitfalls).

All events route to `scripts/cursor-hook.mjs` (via `run-cursor-hook.ps1` on Windows), which dispatches on `hook_event_name` in the stdin JSON payload.

On Windows, `hooks.json` uses a PowerShell wrapper because Cursor 3.5.x pipes hook JSON through PowerShell and Node does not receive it on stdin when invoked directly.

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
