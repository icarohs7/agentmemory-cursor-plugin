#!/usr/bin/env node

/**
 * Cursor-native hook entrypoint for agentmemory.
 * Dispatches on payload.hook_event_name (no Claude Code conversion layer).
 */

import {
	authHeaders,
	extractImageData,
	hookEventName,
	hookLog,
	isSdkChildContext,
	observeBase,
	observeFireAndForget,
	postObserve,
	postSessionEnd,
	postSessionStart,
	projectRoot,
	readJsonFromStdin,
	restFireAndForget,
	REST_URL,
	scheduleHookExit,
	sessionId,
	toolOutput,
	truncate,
} from "./cursor-common.mjs";

const INJECT_CONTEXT = process.env.AGENTMEMORY_INJECT_CONTEXT === "true";

/** File-oriented tools eligible for pre-tool enrich (lowercase; includes Cursor names). */
const ENRICH_FILE_TOOLS = new Set([
	"edit",
	"write",
	"create",
	"read",
	"view",
	"glob",
	"grep",
	"task",
	"shell",
	"webfetch",
	"websearch",
]);

async function handleSessionStart(payload) {
	hookLog("handler", "sessionStart");
	const base = observeBase(payload);
	await postSessionStart(
		{
			sessionId: base.sessionId,
			project: base.project,
			cwd: base.cwd,
		},
		{ inject: INJECT_CONTEXT },
	);
}

async function handleBeforeSubmitPrompt(payload) {
	const prompt = payload.prompt ?? payload.userPrompt ?? "";
	hookLog("handler", "beforeSubmitPrompt", `promptLen=${prompt.length}`);
	const base = observeBase(payload);
	observeFireAndForget({
		hookType: "prompt_submit",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: { prompt: typeof prompt === "string" ? prompt : "" },
	});
}

async function handlePreToolUse(payload) {
	if (!INJECT_CONTEXT) return;

	const toolName =
		typeof payload.tool_name === "string"
			? payload.tool_name
			: typeof payload.toolName === "string"
				? payload.toolName
				: undefined;
	if (!toolName) return;

	const normalizedToolName = toolName.toLowerCase();
	if (!ENRICH_FILE_TOOLS.has(normalizedToolName)) {
		hookLog("handler", "preToolUse", toolName, "skip (tool not enriched)");
		return;
	}
	hookLog("handler", "preToolUse", toolName);

	const rawToolInput = payload.tool_input ?? payload.toolArgs;
	const toolInput =
		typeof rawToolInput === "object" &&
		rawToolInput !== null &&
		!Array.isArray(rawToolInput)
			? rawToolInput
			: {};

	const files = [];
	const fileKeys =
		normalizedToolName === "grep"
			? ["path", "file"]
			: ["file_path", "path", "file", "pattern", "target_directory"];

	for (const key of fileKeys) {
		const val = toolInput[key];
		if (typeof val === "string" && val.length > 0) files.push(val);
	}
	if (files.length === 0) {
		hookLog("handler", "preToolUse", toolName, "skip (no file paths in input)");
		return;
	}

	const terms = [];
	if (normalizedToolName === "grep" || normalizedToolName === "glob") {
		const pattern = toolInput.pattern;
		if (typeof pattern === "string" && pattern.length > 0) terms.push(pattern);
	}

	const base = observeBase(payload);
	try {
		const res = await fetch(`${REST_URL}/agentmemory/enrich`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				sessionId: base.sessionId,
				files,
				terms,
				toolName,
				project: base.project,
			}),
			signal: AbortSignal.timeout(2000),
		});
		if (res.ok) {
			const result = await res.json();
			hookLog("enrich", toolName, res.status, result.context ? "has context" : "no context");
			if (result.context) process.stdout.write(result.context);
		} else {
			hookLog("enrich", toolName, "fail", res.status);
		}
	} catch (err) {
		hookLog("enrich", toolName, "error", err?.message ?? err);
	}
}

async function handlePostToolUse(payload) {
	const toolName = payload.tool_name ?? payload.toolName;
	hookLog("handler", "postToolUse", toolName ?? "?");
	const base = observeBase(payload);
	const rawOutput = toolOutput(payload);
	const { imageData, cleanOutput } = extractImageData(rawOutput);

	observeFireAndForget({
		hookType: "post_tool_use",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: {
			tool_name: toolName,
			tool_input: payload.tool_input ?? payload.toolArgs,
			tool_output: truncate(cleanOutput, 8000),
			duration: payload.duration,
			tool_use_id: payload.tool_use_id,
			...(imageData ? { image_data: imageData } : {}),
		},
	});
}

async function handlePostToolUseFailure(payload) {
	if (payload.is_interrupt || payload.isInterrupt) {
		hookLog("handler", "postToolUseFailure", "skip (interrupt)");
		return;
	}
	const toolName = payload.tool_name ?? payload.toolName;
	hookLog("handler", "postToolUseFailure", toolName ?? "?");
	const base = observeBase(payload);
	const toolInput = payload.tool_input ?? payload.toolArgs;
	const err = payload.error ?? payload.errorMessage;
	observeFireAndForget({
		hookType: "post_tool_failure",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: {
			tool_name: toolName,
			tool_input:
				typeof toolInput === "string"
					? toolInput.slice(0, 4000)
					: JSON.stringify(toolInput ?? "").slice(0, 4000),
			error:
				typeof err === "string"
					? err.slice(0, 4000)
					: JSON.stringify(err ?? "").slice(0, 4000),
		},
	});
}

async function handleAfterFileEdit(payload) {
	const filePath = payload.file_path || "";
	hookLog("handler", "afterFileEdit", filePath || "(no path)");
	const base = observeBase(payload);
	await postObserve({
		hookType: "post_tool_use",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: {
			tool_name: "CursorEdit",
			tool_input: {
				file_path: filePath,
				old_content: payload.old_content,
				new_content: payload.new_content,
			},
			tool_output: filePath ? `Edited ${filePath}` : "file edited",
		},
	});
}

async function handleShellExecution(payload, phase) {
	hookLog("handler", phase === "before" ? "beforeShellExecution" : "afterShellExecution");
	const base = observeBase(payload);
	await postObserve({
		hookType: "post_tool_use",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: {
			tool_name: "Shell",
			tool_input: { command: payload.command || "", phase },
			tool_output: payload.output ?? payload.reason ?? "shell execution",
		},
	});
}

async function handleMcpExecution(payload, phase) {
	hookLog(
		"handler",
		phase === "before" ? "beforeMCPExecution" : "afterMCPExecution",
		payload.mcp_tool_name ?? payload.mcp_server_name ?? "?",
	);
	const base = observeBase(payload);
	await postObserve({
		hookType: "post_tool_use",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: {
			tool_name: payload.mcp_tool_name || payload.mcp_server_name || "MCP",
			tool_input: payload.mcp_tool_input || {},
			tool_output: payload.mcp_tool_output ?? "MCP execution",
			phase,
		},
	});
}

async function handlePreCompact(payload) {
	const base = observeBase(payload);
	if (process.env.CLAUDE_MEMORY_BRIDGE === "true") {
		try {
			await fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
				signal: AbortSignal.timeout(5000),
			});
		} catch {
			// ignore
		}
	}
	try {
		const res = await fetch(`${REST_URL}/agentmemory/context`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				sessionId: base.sessionId,
				project: base.project,
				budget: 1500,
			}),
			signal: AbortSignal.timeout(5000),
		});
		if (res.ok) {
			const result = await res.json();
			if (result.context) process.stdout.write(result.context);
		}
	} catch {
		// ignore
	}
}

async function handleSubagentStart(payload) {
	const base = observeBase(payload);
	await postObserve({
		hookType: "subagent_start",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: {
			agent_id: payload.agent_id,
			agent_type: payload.agent_type,
			subagent_type: payload.subagent_type,
		},
	});
}

async function handleSubagentStop(payload) {
	const base = observeBase(payload);
	await postObserve({
		hookType: "subagent_stop",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: {
			agent_id: payload.agent_id,
			agent_type: payload.agent_type,
			status: payload.status,
			result: truncate(payload.result, 4000),
		},
	});
}

function handleStop(payload) {
	hookLog("handler", "stop");
	const sid = sessionId(payload);
	// Option B: summarize only on stop; /session/end runs on sessionEnd (upstream split).
	restFireAndForget(
		"/agentmemory/summarize",
		{ sessionId: sid },
		{
			timeoutMs: 120000,
			logLabel: `summarize session=${sid.slice(0, 8)}…`,
		},
	);
	scheduleHookExit(500);
}

function handleSessionEnd(payload) {
	hookLog("handler", "sessionEnd");
	const sid = sessionId(payload);
	postSessionEnd(sid);

	if (process.env.CONSOLIDATION_ENABLED === "true") {
		restFireAndForget(
			"/agentmemory/crystals/auto",
			{ olderThanDays: 0 },
			{ timeoutMs: 60000, logLabel: "crystals/auto" },
		);
		restFireAndForget(
			"/agentmemory/consolidate-pipeline",
			{ tier: "all", force: true },
			{ timeoutMs: 120000, logLabel: "consolidate-pipeline" },
		);
	}

	if (process.env.CLAUDE_MEMORY_BRIDGE === "true") {
		restFireAndForget("/agentmemory/claude-bridge/sync", undefined, {
			timeoutMs: 30000,
			logLabel: "claude-bridge/sync",
		});
	}

	scheduleHookExit(1500);
}

async function main() {
	hookLog("start", `backend=${REST_URL}`, `cwd=${process.cwd()}`);
	const payload = await readJsonFromStdin();
	if (!payload) {
		hookLog("exit", "no stdin payload");
		return;
	}
	if (isSdkChildContext(payload)) {
		hookLog("exit", "sdk child context");
		return;
	}

	const event = hookEventName(payload);
	if (!event) {
		hookLog("exit", "missing hook_event_name");
		return;
	}

	const sid = sessionId(payload);
	const root = projectRoot(payload);
	hookLog("event", event, `session=${sid.slice(0, 8)}…`, `project=${root}`);

	switch (event) {
		case "sessionStart":
			await handleSessionStart(payload);
			break;
		case "beforeSubmitPrompt":
			await handleBeforeSubmitPrompt(payload);
			break;
		case "preToolUse":
			await handlePreToolUse(payload);
			break;
		case "postToolUse":
			await handlePostToolUse(payload);
			break;
		case "postToolUseFailure":
			await handlePostToolUseFailure(payload);
			break;
		case "afterFileEdit":
			await handleAfterFileEdit(payload);
			break;
		case "afterShellExecution":
			await handleShellExecution(payload, "after");
			break;
		case "beforeShellExecution":
			await handleShellExecution(payload, "before");
			break;
		case "afterMCPExecution":
			await handleMcpExecution(payload, "after");
			break;
		case "beforeMCPExecution":
			await handleMcpExecution(payload, "before");
			break;
		case "preCompact":
			await handlePreCompact(payload);
			break;
		case "subagentStart":
			await handleSubagentStart(payload);
			break;
		case "subagentStop":
			await handleSubagentStop(payload);
			break;
		case "stop":
			handleStop(payload);
			break;
		case "sessionEnd":
			handleSessionEnd(payload);
			break;
		default:
			hookLog("handler", event, "no-op (unhandled event)");
			break;
	}

	hookLog("done", event);
}

main().catch((err) => {
	hookLog("fatal", err?.message ?? err);
});
