#!/usr/bin/env node
/**
 * Kimi Code CLI → agentmemory adapter.
 * Reads Kimi hook JSON from stdin, normalizes event/tool names for cursor-hook.mjs, then runs it.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookScript = join(__dirname, "..", "scripts", "cursor-hook.mjs");

/** Kimi PascalCase events → Cursor camelCase handlers in cursor-hook.mjs */
const EVENT_MAP = {
	SessionStart: "sessionStart",
	SessionEnd: "sessionEnd",
	UserPromptSubmit: "beforeSubmitPrompt",
	PreToolUse: "preToolUse",
	PostToolUse: "postToolUse",
	PostToolUseFailure: "postToolUseFailure",
	PreCompact: "preCompact",
	SubagentStart: "subagentStart",
	SubagentStop: "subagentStop",
	Stop: "stop",
};

/** Kimi tool names → Cursor tool names (for enrich / observe). */
const TOOL_MAP = {
	ReadFile: "Read",
	WriteFile: "Write",
	StrReplaceFile: "Write",
	EditFile: "Write",
	Grep: "Grep",
	Glob: "Glob",
	Shell: "Shell",
	Task: "Task",
	WebFetch: "WebFetch",
	WebSearch: "WebSearch",
};

function hookLog(...args) {
	if (process.env.AGENTMEMORY_HOOK_DEBUG === "false") return;
	console.error("[agentmemory:kimi]", ...args);
}

function readStdinSync() {
	if (process.stdin.isTTY) return "";
	try {
		return readFileSync(0, "utf8");
	} catch {
		return "";
	}
}

function normalizeToolName(name) {
	if (typeof name !== "string" || !name) return name;
	return TOOL_MAP[name] ?? name;
}

function normalizePayload(raw) {
	let payload;
	try {
		payload = JSON.parse(raw);
	} catch {
		hookLog("exit", "invalid JSON on stdin");
		process.exit(0);
	}

	const kimiEvent =
		payload.hook_event_name ||
		payload.hookEventName ||
		payload.event ||
		"";

	const cursorEvent = EVENT_MAP[kimiEvent];
	if (!cursorEvent) {
		hookLog("exit", "unmapped event", kimiEvent || "(missing)");
		process.exit(0);
	}

	payload.hook_event_name = cursorEvent;

	if (typeof payload.tool_name === "string") {
		payload.tool_name = normalizeToolName(payload.tool_name);
	}

	if (payload.tool_output != null && payload.tool_response == null) {
		payload.tool_response = payload.tool_output;
	}

	return JSON.stringify(payload);
}

hookLog("start", `handler=${hookScript}`);

const raw = readStdinSync();
if (!raw.trim()) {
	hookLog("exit", "no stdin payload");
	process.exit(0);
}

const normalized = normalizePayload(raw);
const result = spawnSync(process.execPath, [hookScript], {
	input: normalized,
	stdio: ["pipe", "inherit", "inherit"],
	env: process.env,
	cwd: process.cwd(),
	encoding: "utf8",
});

process.exit(result.status ?? 0);
