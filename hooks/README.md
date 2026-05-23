# agentmemory hooks (Cursor-native)

`hooks.json` uses **Cursor-native** hook events (`sessionStart`, `beforeSubmitPrompt`, `postToolUse`, `afterFileEdit`, etc.). Cursor loads this format directly — no Claude Code → Cursor conversion (and no `matcher.split` pitfalls).

All events route to `scripts/cursor-hook.mjs`, which dispatches on `hook_event_name` in the stdin JSON payload.

## Claude Code format (backup)

`hooks.claude.json` is the previous Claude Code marketplace layout. Keep it for reference or if you copy this plugin back to Claude Code; Cursor should use `hooks.json` only.

## Optional environment variables

| Variable | Effect |
|----------|--------|
| `AGENTMEMORY_URL` | Backend URL (default `http://localhost:3111`) |
| `AGENTMEMORY_SECRET` | Bearer token when required |
| `AGENTMEMORY_INJECT_CONTEXT=true` | Inject memory context on `sessionStart` and file tools on `preToolUse` |
| `CONSOLIDATION_ENABLED=true` | Run consolidation on `sessionEnd` |
| `CLAUDE_MEMORY_BRIDGE=true` | Sync with Claude `MEMORY.md` on compact/end |

After editing hooks, reload the Cursor window.
