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

`kimi-hook.mjs` reads JSON from stdin (Kimi protocol), maps event and tool names to the Cursor-native names expected by `../scripts/cursor-hook.mjs`, then runs that script with the normalized payload on stdin.

Optional environment variables match the Cursor plugin (see [hooks/README.md](../hooks/README.md)): `AGENTMEMORY_URL`, `AGENTMEMORY_SECRET`, `AGENTMEMORY_INJECT_CONTEXT`, `AGENTMEMORY_HOOK_DEBUG`, etc.

## Kimi vs Cursor coverage

| Kimi event | agentmemory handler |
|------------|---------------------|
| `SessionStart` | session start (+ optional context inject) |
| `UserPromptSubmit` | prompt observe |
| `PreToolUse` / `PostToolUse` / `PostToolUseFailure` | tool observe / enrich |
| `PreCompact` | compact + optional bridge |
| `SubagentStart` / `SubagentStop` | subagent observe |
| `Stop` / `SessionEnd` | stop + session end |

Kimi has no `afterShellExecution` / `afterMCPExecution` / `afterFileEdit` hooks; file edits are covered via `PostToolUse` on write tools.
