#!/usr/bin/env node
/**
 * Kimi Code CLI → agentmemory adapter.
 * Reads Kimi hook JSON from stdin, normalizes event/tool names for cursor-hook.mjs, then runs it.
 *
 * Tool names: only Kimi-specific renames here. cursor-hook.mjs lowercases tool names
 * for enrich eligibility (Read/Write/Grep/…); identity names (Shell, Grep, Task) pass through.
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
	Notification: "notification",
	TaskCompleted: "taskCompleted",
};

/** Kimi file-tool names → names used by cursor-hook / Cursor matchers */
const KIMI_TOOL_RENAMES = {
	ReadFile: "Read",
	WriteFile: "Write",
	StrReplaceFile: "Write",
	EditFile: "Write",
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
	return KIMI_TOOL_RENAMES[name] ?? name;
}

/** Map Kimi payload fields to shapes cursor-hook.mjs already accepts. */
function normalizeFieldAliases(payload) {
	if (payload.tool_output != null && payload.tool_response == null) {
		payload.tool_response = payload.tool_output;
	}
	if (payload.prompt != null && payload.userPrompt == null) {
		payload.userPrompt = payload.prompt;
	}
	if (payload.body != null && payload.message == null) {
		payload.message = payload.body;
	}
	const agentName = payload.agent_name;
	if (typeof agentName === "string" && agentName) {
		if (!payload.agent_id && !payload.agentId) payload.agentId = agentName;
		if (!payload.agentName) payload.agentName = agentName;
	}
	const response = payload.response;
	if (typeof response === "string" && response) {
		if (!payload.last_assistant_message && !payload.lastAssistantMessage) {
			payload.lastAssistantMessage = response;
		}
		if (payload.result == null) payload.result = response;
	}
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
	normalizeFieldAliases(payload);

	if (typeof payload.tool_name === "string") {
		payload.tool_name = normalizeToolName(payload.tool_name);
	}
	if (typeof payload.toolName === "string") {
		payload.toolName = normalizeToolName(payload.toolName);
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
