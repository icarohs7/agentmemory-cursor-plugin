#!/usr/bin/env node

/** Shared helpers for Cursor-native agentmemory hooks. */

export const REST_URL = process.env.AGENTMEMORY_URL || "http://localhost:3111";
export const SECRET = process.env.AGENTMEMORY_SECRET || "";

export function authHeaders() {
	const h = { "Content-Type": "application/json" };
	if (SECRET) h.Authorization = `Bearer ${SECRET}`;
	return h;
}

export async function readJsonFromStdin() {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	if (!input.trim()) return null;
	try {
		return JSON.parse(input);
	} catch {
		return null;
	}
}

export function isSdkChildContext(payload) {
	if (process.env.AGENTMEMORY_SDK_CHILD === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}

/** Cursor sends conversation_id; older payloads may use session_id only. */
export function sessionId(payload) {
	return (
		payload.session_id ||
		payload.conversation_id ||
		`cursor-${Date.now().toString(36)}`
	);
}

/** Prefer workspace root over empty cwd (common in home / empty-window chats). */
export function projectRoot(payload) {
	if (typeof payload.cwd === "string" && payload.cwd.length > 0) {
		return payload.cwd;
	}
	const roots = payload.workspace_roots;
	if (Array.isArray(roots)) {
		for (const r of roots) {
			if (typeof r === "string" && r.length > 0) return r;
		}
	}
	return process.cwd();
}

export function hookEventName(payload) {
	if (typeof payload.hook_event_name === "string" && payload.hook_event_name) {
		return payload.hook_event_name;
	}
	return "";
}

export async function postObserve(body, timeoutMs = 3000) {
	try {
		await fetch(`${REST_URL}/agentmemory/observe`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch {
		// hooks must never block the host
	}
}

export async function postSessionStart(body, { inject = false } = {}) {
	const timeoutMs = inject ? 1500 : 800;
	try {
		const res = await fetch(`${REST_URL}/agentmemory/session/start`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (inject && res.ok) {
			const data = await res.json();
			if (typeof data.context === "string" && data.context) {
				process.stdout.write(data.context);
			}
		}
	} catch {
		// ignore
	}
}

export async function postSessionEnd(sessionId, timeoutMs = 30000) {
	try {
		await fetch(`${REST_URL}/agentmemory/session/end`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ sessionId }),
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch {
		// ignore
	}
}

export function truncate(value, max) {
	if (typeof value === "string" && value.length > max) {
		return `${value.slice(0, max)}\n[...truncated]`;
	}
	if (typeof value === "object" && value !== null) {
		const str = JSON.stringify(value);
		if (str.length > max) return `${str.slice(0, max)}...[truncated]`;
		return value;
	}
	return value;
}

function isBase64Image(val) {
	return (
		typeof val === "string" &&
		(val.startsWith("data:image/") ||
			val.startsWith("iVBORw0KGgo") ||
			val.startsWith("/9j/"))
	);
}

export function extractImageData(output) {
	if (isBase64Image(output)) {
		return { imageData: output, cleanOutput: "[image data extracted]" };
	}
	if (typeof output === "object" && output !== null && !Array.isArray(output)) {
		let imageData;
		const clean = {};
		for (const [key, val] of Object.entries(output)) {
			if (!imageData && isBase64Image(val)) {
				imageData = val;
				clean[key] = "[image data extracted]";
			} else {
				clean[key] = val;
			}
		}
		return { imageData, cleanOutput: clean };
	}
	return { imageData: undefined, cleanOutput: output };
}

export function observeBase(payload) {
	const sid = sessionId(payload);
	const root = projectRoot(payload);
	return {
		sessionId: sid,
		project: root,
		cwd: root,
		timestamp: new Date().toISOString(),
	};
}
