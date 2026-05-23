#!/usr/bin/env node

/**
 * Cursor-native hook entrypoint for agentmemory.
 * Dispatches on payload.hook_event_name (no Claude Code conversion layer).
 */

import {
	authHeaders,
	extractImageData,
	hookEventName,
	isSdkChildContext,
	observeBase,
	postObserve,
	postSessionEnd,
	postSessionStart,
	projectRoot,
	readJsonFromStdin,
	REST_URL,
	sessionId,
	truncate,
} from "./cursor-common.mjs";

const INJECT_CONTEXT = process.env.AGENTMEMORY_INJECT_CONTEXT === "true";

/** Cursor tool names that support pre-tool enrich (file-oriented tools). */
const ENRICH_TOOLS = new Set([
	"Read",
	"Write",
	"Grep",
	"Glob",
	"Task",
	"WebFetch",
	"WebSearch",
]);

async function handleSessionStart(payload) {
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
	const base = observeBase(payload);
	await postObserve({
		hookType: "prompt_submit",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: { prompt: payload.prompt || "" },
	});
}

async function handlePreToolUse(payload) {
	if (!INJECT_CONTEXT) return;

	const toolName = payload.tool_name;
	if (!toolName || !ENRICH_TOOLS.has(toolName)) return;

	const toolInput = payload.tool_input || {};
	const files = [];
	const fileKeys =
		toolName === "Grep"
			? ["path", "file", "file_path"]
			: ["file_path", "path", "file", "pattern", "target_directory"];

	for (const key of fileKeys) {
		const val = toolInput[key];
		if (typeof val === "string" && val.length > 0) files.push(val);
	}
	if (files.length === 0) return;

	const terms = [];
	if (toolName === "Grep" || toolName === "Glob") {
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
			}),
			signal: AbortSignal.timeout(2000),
		});
		if (res.ok) {
			const result = await res.json();
			if (result.context) process.stdout.write(result.context);
		}
	} catch {
		// ignore
	}
}

async function handlePostToolUse(payload) {
	const base = observeBase(payload);
	const rawOutput = payload.tool_response ?? payload.tool_output;
	const { imageData, cleanOutput } = extractImageData(rawOutput);

	await postObserve({
		hookType: "post_tool_use",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: {
			tool_name: payload.tool_name,
			tool_input: payload.tool_input,
			tool_output: truncate(cleanOutput, 8000),
			duration: payload.duration,
			tool_use_id: payload.tool_use_id,
			...(imageData ? { image_data: imageData } : {}),
		},
	});
}

async function handlePostToolUseFailure(payload) {
	if (payload.is_interrupt) return;
	const base = observeBase(payload);
	await postObserve({
		hookType: "post_tool_failure",
		sessionId: base.sessionId,
		project: base.project,
		cwd: base.cwd,
		timestamp: base.timestamp,
		data: {
			tool_name: payload.tool_name,
			tool_input:
				typeof payload.tool_input === "string"
					? payload.tool_input.slice(0, 4000)
					: JSON.stringify(payload.tool_input ?? "").slice(0, 4000),
			error:
				typeof payload.error === "string"
					? payload.error.slice(0, 4000)
					: JSON.stringify(payload.error ?? "").slice(0, 4000),
		},
	});
}

async function handleAfterFileEdit(payload) {
	const base = observeBase(payload);
	const filePath = payload.file_path || "";
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
				cwd: base.cwd,
			}),
			signal: AbortSignal.timeout(3000),
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

async function handleStop(payload) {
	const sid = sessionId(payload);
	try {
		await fetch(`${REST_URL}/agentmemory/summarize`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ sessionId: sid }),
			signal: AbortSignal.timeout(120000),
		});
	} catch {
		// ignore
	}
}

async function handleSessionEnd(payload) {
	const sid = sessionId(payload);
	await postSessionEnd(sid);

	if (process.env.CONSOLIDATION_ENABLED === "true") {
		try {
			await fetch(`${REST_URL}/agentmemory/crystals/auto`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ olderThanDays: 0 }),
				signal: AbortSignal.timeout(60000),
			});
		} catch {
			// ignore
		}
		try {
			await fetch(`${REST_URL}/agentmemory/consolidate-pipeline`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ tier: "all", force: true }),
				signal: AbortSignal.timeout(120000),
			});
		} catch {
			// ignore
		}
	}

	if (process.env.CLAUDE_MEMORY_BRIDGE === "true") {
		try {
			await fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
				method: "POST",
				headers: authHeaders(),
				signal: AbortSignal.timeout(30000),
			});
		} catch {
			// ignore
		}
	}
}

async function main() {
	const payload = await readJsonFromStdin();
	if (!payload || isSdkChildContext(payload)) return;

	const event = hookEventName(payload);
	if (!event) return;

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
			await handleStop(payload);
			break;
		case "sessionEnd":
			await handleSessionEnd(payload);
			break;
		default:
			break;
	}
}

main();
