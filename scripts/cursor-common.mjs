#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProject } from "./resolve-project.mjs";

/** Shared helpers for Cursor-native agentmemory hooks. */

export const REST_URL = process.env.AGENTMEMORY_URL || "http://localhost:3111";
export const SECRET = process.env.AGENTMEMORY_SECRET || "";

/** Set AGENTMEMORY_HOOK_DEBUG=false to silence hook trace logs. */
const HOOK_DEBUG = process.env.AGENTMEMORY_HOOK_DEBUG !== "false";

/** Logs to stderr so stdout stays free for hook JSON responses. Shows in cursor.hooks log STDERR. */
export function hookLog(...args) {
	if (!HOOK_DEBUG) return;
	console.error("[agentmemory]", ...args);
}

export function authHeaders() {
	const h = { "Content-Type": "application/json" };
	if (SECRET) h.Authorization = `Bearer ${SECRET}`;
	return h;
}

function windowsTempDirs() {
	const dirs = new Set();
	for (const value of [
		tmpdir(),
		process.env.TEMP,
		process.env.TMP,
		process.env.LOCALAPPDATA
			? join(process.env.LOCALAPPDATA, "Temp")
			: undefined,
	]) {
		if (typeof value === "string" && value.length > 0) dirs.add(value);
	}
	return [...dirs];
}

/** Cursor on Windows writes hook JSON to a temp file; PowerShell often does not pipe it to node stdin. */
function readPayloadFromWindowsTempFile() {
	if (process.platform !== "win32") return null;
	const now = Date.now();
	const candidates = [];
	for (const dir of windowsTempDirs()) {
		try {
			for (const name of readdirSync(dir)) {
				if (
					!name.startsWith("cursor-hook-payload-") ||
					!name.endsWith(".json")
				) {
					continue;
				}
				const path = join(dir, name);
				const mtime = statSync(path).mtimeMs;
				if (now - mtime < 120_000) candidates.push({ path, mtime });
			}
		} catch {
			// ignore unreadable temp dirs
		}
	}
	candidates.sort((a, b) => b.mtime - a.mtime);
	hookLog(
		"temp payload scan",
		`dirs=${windowsTempDirs().length}`,
		`matches=${candidates.length}`,
	);
	if (candidates.length === 0) return null;
	hookLog("temp payload using", candidates[0].path);
	return readFileSync(candidates[0].path, "utf8");
}

export async function readJsonFromStdin() {
	let input = "";
	try {
		if (!process.stdin.isTTY) {
			input = readFileSync(0, "utf8");
		}
	} catch {
		// ignore
	}
	// Do not block on an interactive TTY; Cursor hooks use a pipe or temp file on Windows.
	if (!input.trim() && !process.stdin.isTTY) {
		const chunks = [];
		for await (const chunk of process.stdin) {
			chunks.push(chunk);
		}
		if (chunks.length > 0) {
			input = Buffer.concat(chunks).toString("utf8");
		}
	}
	if (!input.trim()) {
		input = readPayloadFromWindowsTempFile() ?? "";
	}
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
		const res = await fetch(`${REST_URL}/agentmemory/observe`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		});
		hookLog(
			"observe",
			body.hookType,
			`session=${body.sessionId?.slice(0, 8)}…`,
			res.ok ? `ok ${res.status}` : `fail ${res.status}`,
		);
	} catch (err) {
		hookLog("observe", body.hookType, "error", err?.message ?? err);
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
		hookLog(
			"session/start",
			`session=${body.sessionId?.slice(0, 8)}…`,
			`project=${body.project ?? "(none)"}`,
			res.ok ? `ok ${res.status}` : `fail ${res.status}`,
			inject ? "inject=true" : "",
		);
		if (inject && res.ok) {
			const data = await res.json();
			if (typeof data.context === "string" && data.context) {
				hookLog("session/start", "injected context", `${data.context.length} chars`);
				process.stdout.write(data.context);
			}
		}
	} catch (err) {
		hookLog("session/start", "error", err?.message ?? err);
	}
}

export async function postSessionEnd(sessionId, timeoutMs = 30000) {
	try {
		const res = await fetch(`${REST_URL}/agentmemory/session/end`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ sessionId }),
			signal: AbortSignal.timeout(timeoutMs),
		});
		hookLog(
			"session/end",
			`session=${sessionId?.slice(0, 8)}…`,
			res.ok ? `ok ${res.status}` : `fail ${res.status}`,
		);
	} catch (err) {
		hookLog("session/end", "error", err?.message ?? err);
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
	const cwd = projectRoot(payload);
	return {
		sessionId: sid,
		project: resolveProject(cwd),
		cwd,
		timestamp: new Date().toISOString(),
	};
}
