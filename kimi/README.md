# Kimi Code CLI hooks

Adapter for [Kimi Code CLI](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html) lifecycle hooks.

## Setup

1. Clone this repository somewhere on your machine.
2. Run the [agentmemory](https://github.com/rohitg00/agentmemory) backend (`http://localhost:3111` by default).
3. Copy the `[[hooks]]` entries from [config.toml.example](config.toml.example) into `~/.kimi/config.toml`.
4. Replace every `PLUGIN_ROOT` in `command` with the **absolute path** to your clone (see the example file header). Use `run-hook.ps1` on Windows if you do not use Git Bash.
5. In Kimi shell mode, run `/hooks` to confirm they are loaded.

`run-hook.sh` and `run-hook.ps1` locate `kimi-hook.mjs` relative to themselves, so you only substitute the path to the wrapper script, not your username or OS home directory in the repo.

## How it works

`kimi-hook.mjs` reads JSON from stdin (Kimi protocol), maps event and tool names to the Cursor-native names expected by `../scripts/cursor-hook.mjs`, normalizes a few Kimi-specific field names, then runs that script with the normalized payload on stdin.

**Tool mapping:** Only Kimi file-tool names are renamed (`ReadFile` → `Read`, `WriteFile` / `EditFile` / `StrReplaceFile` → `Write`). Names that already match Cursor (`Shell`, `Grep`, `Glob`, `Task`, …) are unchanged. Enrich eligibility and case handling live in `cursor-hook.mjs` (lowercase tool check).

**Field aliases:** `tool_output` → `tool_response`, `prompt` → `userPrompt`, `body` → `message` (notifications), `agent_name` → `agentId` / `agentName`, `response` → `lastAssistantMessage` / `result` (subagent stop).

Optional environment variables match the Cursor plugin (see [hooks/README.md](../hooks/README.md)): `AGENTMEMORY_URL`, `AGENTMEMORY_SECRET`, `AGENTMEMORY_INJECT_CONTEXT`, `AGENTMEMORY_HOOK_DEBUG`, etc.

## Kimi vs Cursor coverage

| Kimi event | Cursor handler | Notes |
|------------|----------------|-------|
| `SessionStart` | `sessionStart` | Optional context inject |
| `SessionEnd` | `sessionEnd` | Consolidation when env enabled |
| `UserPromptSubmit` | `beforeSubmitPrompt` | |
| `PreToolUse` / `PostToolUse` / `PostToolUseFailure` | same | File tools renamed; enrich in cursor-hook |
| `PreCompact` | `preCompact` | |
| `SubagentStart` / `SubagentStop` | same | `agent_name` mapped |
| `Stop` | `stop` | Summarize only (Option B lifecycle) |
| `Notification` | `notification` | Only `permission_prompt` observed |
| `TaskCompleted` | `taskCompleted` | Mapped for parity; Kimi docs use `Stop` for turn end |

**Not mapped (no cursor-hook handler yet):** `PostCompact`, `StopFailure`. Add to `EVENT_MAP` in `kimi-hook.mjs` when handlers exist.

Kimi has no `afterShellExecution` / `afterMCPExecution` / `afterFileEdit` hooks; file edits are covered via `PostToolUse` on write tools.

Optional `Notification` hook example (matcher `permission_prompt`):

```toml
[[hooks]]
event = "Notification"
matcher = "permission_prompt"
command = "bash PLUGIN_ROOT/kimi/run-hook.sh"
timeout = 15
```
