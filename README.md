# agentmemory-cursor-plugin

Cursor IDE plugin (hooks + skills) for [**agentmemory**](https://github.com/rohitg00/agentmemory) — persistent memory for AI coding agents.

This repository is **not** the core agentmemory server. It is a **derivative adaptation** of the upstream project’s hook/skill integration, focused on:

- **Cursor-native hooks** (`sessionStart`, `beforeSubmitPrompt`, `postToolUse`, `afterFileEdit`, shell/MCP events, etc.) with behavior aligned to upstream **v0.9.24** (project basename scoping, fire-and-forget telemetry, split stop/sessionEnd lifecycle)
- **Windows reliability** — hook JSON delivery when Cursor does not pipe stdin to Node (bootstrap + temp-file fallback)

## Credits

| | |
|---|---|
| **Original project** | [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) by [Rohit Ghumare](https://github.com/rohitg00) |
| **License** | [Apache-2.0](LICENSE) (same as upstream) |
| **This adaptation** | Maintained by [Icaro Temponi](https://github.com/icarohs7) — Cursor/Windows hook layer only |

Hook scripts and skills here are based on upstream agentmemory **v0.9.24** plugin behavior (single entrypoint: `scripts/cursor-hook.mjs`). Please use, star, and contribute to the **original** project for the memory engine, MCP server, and core features.

**Plugin version:** `0.9.24` (see `.cursor-plugin/plugin.json`) tracks upstream hook semantics, not the core server release cadence.

## Requirements

1. Run the **agentmemory** backend (see [upstream docs](https://github.com/rohitg00/agentmemory)).
2. Install this plugin in Cursor (local plugin path or marketplace, depending on your setup).

Default backend URL: `http://localhost:3111` (override with `AGENTMEMORY_URL`).

## Configuration

See [hooks/README.md](hooks/README.md) for hook events, fire-and-forget behavior, `resolveProject` / `project` vs `cwd`, and environment variables.

| Variable | Default | Notes |
|----------|---------|--------|
| `AGENTMEMORY_URL` | `http://localhost:3111` | Backend base URL |
| `AGENTMEMORY_INJECT_CONTEXT` | **off** | Set `true` for session + pre-tool memory injection |
| `AGENTMEMORY_PROJECT_NAME` | (git basename) | Override project key for observes |
| `AGENTMEMORY_HOOK_DEBUG` | on | Set `false` to silence `[agentmemory]` stderr traces |
| `CONSOLIDATION_ENABLED` | off | `true` runs consolidation on `sessionEnd` |
| `CLAUDE_MEMORY_BRIDGE` | off | `true` syncs bridge on compact/end |

## Kimi Code CLI

For [Kimi Code CLI](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html), use the adapter in [kimi/](kimi/) and [kimi/config.toml.example](kimi/config.toml.example) (replace `PLUGIN_ROOT` with your clone path; no machine-specific paths are committed).

## Upstream sync playbook

When [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) releases hook changes, use [.memory/plan.md](.memory/plan.md) and [.memory/progress.md](.memory/progress.md) as the checklist template (completed v0.9.24 port, commits `7296392`–`244e276`).

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
