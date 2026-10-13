import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { detectWslProjectsDir } from "./launcher.ts";
import { summarizeTranscript, type TranscriptSummary } from "./transcript.ts";
import type { Env, LodestoneSettings } from "./types";

export interface SessionInfo extends TranscriptSummary {
	sessionId: string;
	/** Which claude install owns the session; that's where it can be resumed. */
	env: Env;
	file: string;
}

const MISS_TTL_MS = 30_000;

/** Finds session transcripts in both the Windows and the WSL ~/.claude stores. */
export class SessionStore {
	private paths = new Map<string, { env: Env; file: string }>();
	private misses = new Map<string, number>();
	private wslDir: Promise<string | null> | null = null;
	private getSettings: () => LodestoneSettings;

	constructor(getSettings: () => LodestoneSettings) {
		this.getSettings = getSettings;
	}

	/** Call after settings change. */
	reset(): void {
		this.paths.clear();
		this.misses.clear();
		this.wslDir = null;
	}

	windowsProjectsDir(): string {
		return this.getSettings().windowsProjectsDir.trim() || path.join(os.homedir(), ".claude", "projects");
	}

	wslProjectsDir(): Promise<string | null> {
		const configured = this.getSettings().wslProjectsDir.trim();
		if (configured) return Promise.resolve(configured);
		this.wslDir ??= detectWslProjectsDir(this.getSettings());
		return this.wslDir;
	}

	async lookup(sessionId: string): Promise<SessionInfo | null> {
		const found = await this.locate(sessionId);
		if (!found) return null;
		try {
			const text = await fs.promises.readFile(found.file, "utf8");
			return { sessionId, ...found, ...summarizeTranscript(text) };
		} catch {
			this.paths.delete(sessionId);
			return null;
		}
	}

	private async locate(sessionId: string): Promise<{ env: Env; file: string } | null> {
		const cached = this.paths.get(sessionId);
		if (cached) return cached;
		const missedAt = this.misses.get(sessionId);
		if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return null;

		const stores: { env: Env; dir: string | null }[] = [
			{ env: "powershell", dir: this.windowsProjectsDir() },
			{ env: "wsl", dir: await this.wslProjectsDir() },
		];
		const hits = (await Promise.all(stores.map(async (s) => (s.dir ? findIn(s.dir, sessionId, s.env) : [])))).flat();
		if (!hits.length) {
			this.misses.set(sessionId, Date.now());
			return null;
		}
		hits.sort((a, b) => b.mtime - a.mtime);
		const best = { env: hits[0].env, file: hits[0].file };
		this.paths.set(sessionId, best);
		return best;
	}
}

async function findIn(dir: string, sessionId: string, env: Env) {
	let projects: string[];
	try {
		projects = await fs.promises.readdir(dir);
	} catch {
		return [];
	}
	const results = await Promise.all(
		projects.map(async (p) => {
			const file = path.join(dir, p, sessionId + ".jsonl");
			try {
				const st = await fs.promises.stat(file);
				return { env, file, mtime: st.mtimeMs };
			} catch {
				return null;
			}
		}),
	);
	return results.filter((r): r is { env: Env; file: string; mtime: number } => r !== null);
}
