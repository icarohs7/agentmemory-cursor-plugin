#!/usr/bin/env node

import { execSync } from "node:child_process";
import { basename } from "node:path";

/** AGENTMEMORY_PROJECT_NAME → git toplevel basename → cwd basename (upstream _project.ts). */
export function resolveProject(cwd) {
	const explicit = process.env.AGENTMEMORY_PROJECT_NAME;
	if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

	const dir =
		typeof cwd === "string" && cwd.trim().length > 0 ? cwd.trim() : process.cwd();

	try {
		const top = execSync("git rev-parse --show-toplevel", {
			cwd: dir,
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 500,
		})
			.toString()
			.trim();
		if (top) return basename(top);
	} catch {
		// not a git repo or git unavailable
	}

	return basename(dir);
}
