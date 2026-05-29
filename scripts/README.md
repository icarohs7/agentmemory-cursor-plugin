# Hook scripts (Cursor plugin)

All Cursor and Kimi hook events are handled by a **single dispatcher**:

| File | Role |
|------|------|
| `cursor-hook-bootstrap.mjs` | Windows: read hook JSON from temp file, forward to dispatcher |
| `cursor-hook.mjs` | Dispatch on `hook_event_name`; call backend REST APIs |
| `cursor-common.mjs` | Shared I/O, observe helpers, session start/end |
| `resolve-project.mjs` | `project` basename for observes (upstream `_project.ts`) |

Configured in [`../hooks/hooks.json`](../hooks/hooks.json). See [`../hooks/README.md`](../hooks/README.md) for events, env vars, and fire-and-forget behavior.

Kimi CLI uses [`../kimi/kimi-hook.mjs`](../kimi/kimi-hook.mjs) to normalize payloads, then runs `cursor-hook.mjs`.

## Upstream reference

Per-hook bundles that used to live here (`session-start.mjs`, `post-tool-use.mjs`, etc.) were vendored snapshots from [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) and are **removed** — they drifted from the active Cursor port. For upstream hook source, see `src/hooks/` on that repository (~v0.9.24).
