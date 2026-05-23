#!/usr/bin/env node
/**
 * Windows bootstrap: read Cursor's hook payload from temp file, then run cursor-hook.mjs with it on stdin.
 * Cursor 3.5.x on Windows does not pipe JSON into node reliably.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookScript = join(__dirname, "cursor-hook.mjs");

function hookLog(...args) {
	if (process.env.AGENTMEMORY_HOOK_DEBUG === "false") return;
	console.error("[agentmemory]", ...args);
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

function readCursorHookPayload() {
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
			// ignore
		}
	}
	candidates.sort((a, b) => b.mtime - a.mtime);
	hookLog(
		"bootstrap temp scan",
		`dirs=${windowsTempDirs().length}`,
		`matches=${candidates.length}`,
	);
	if (candidates.length === 0) return "";
	hookLog("bootstrap using", candidates[0].path);
	return readFileSync(candidates[0].path, "utf8");
}

function readStdinSync() {
	if (process.stdin.isTTY) return "";
	try {
		return readFileSync(0, "utf8");
	} catch {
		return "";
	}
}

hookLog("bootstrap start", `cwd=${process.cwd()}`);

let payload = "";
if (process.platform === "win32") {
	payload = readCursorHookPayload();
}
if (!payload.trim()) {
	payload = readStdinSync();
}

if (!payload.trim()) {
	hookLog("bootstrap exit", "no payload");
	process.exit(0);
}

const result = spawnSync(process.execPath, [hookScript], {
	input: payload,
	stdio: ["pipe", "inherit", "inherit"],
	env: process.env,
	cwd: process.cwd(),
	encoding: "utf8",
});

process.exit(result.status ?? 1);
