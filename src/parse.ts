import type { Env } from "./types";

export const SESSION_LANG = "claude-session";
export const PROMPT_LANG = "claude-prompt";

export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export interface SessionBlock {
	sessionId: string | null;
	/** `Session name:` from a pasted /status. */
	name: string | null;
	fields: Record<string, string>;
}

/** Parses `Key: value` lines (as printed by /status); falls back to the first UUID anywhere. */
export function parseSessionBody(source: string): SessionBlock {
	const fields: Record<string, string> = {};
	for (const line of source.split(/\r?\n/)) {
		// indexOf + trim rather than a regex: overlapping \s* groups made a long line of
		// spaces take cubic time, which froze Obsidian on render.
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		const value = line.slice(colon + 1).trim();
		if (key && value) fields[key.toLowerCase()] = value;
	}
	const idField = fields["session id"] ?? fields["session"] ?? fields["id"];
	const sessionId = (idField && UUID_RE.exec(idField)?.[0]) ?? UUID_RE.exec(source)?.[0] ?? null;
	return {
		sessionId: sessionId?.toLowerCase() ?? null,
		name: fields["session name"] ?? fields["name"] ?? null,
		fields,
	};
}

export interface PromptRun {
	time: string;
	env: Env;
	sessionId: string;
}

export interface PromptBlock {
	prompt: string;
	runs: PromptRun[];
}

const RUN_RE =
	/^\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*\|\s*(powershell|wsl)\s*\|\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i;

export function parseRunLine(line: string): PromptRun | null {
	const m = RUN_RE.exec(line);
	if (!m) return null;
	return { time: m[1], env: m[2].toLowerCase() as Env, sessionId: m[3].toLowerCase() };
}

export function formatRunLine(run: PromptRun): string {
	return `${run.time} | ${run.env} | ${run.sessionId}`;
}

/**
 * Splits a prompt block into the prompt and its run history. History lives below the
 * last `---` line, but only if everything after it is run lines, so prompts can still
 * contain their own `---`.
 */
export function parsePromptBody(source: string): PromptBlock {
	const lines = source.split(/\r?\n/);
	const sep = findHistorySeparator(lines);
	if (sep === -1) return { prompt: source.trim(), runs: [] };
	const runs = lines.slice(sep + 1).map(parseRunLine).filter((r): r is PromptRun => r !== null);
	return { prompt: lines.slice(0, sep).join("\n").trim(), runs };
}

export function findHistorySeparator(lines: string[]): number {
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].trim() !== "---") continue;
		const rest = lines.slice(i + 1).filter((l) => l.trim() !== "");
		return rest.every((l) => parseRunLine(l)) ? i : -1;
	}
	return -1;
}

/** Text after the language on the opening fence: ```claude-session My Title → "My Title". */
export function titleFromFence(fenceLine: string, lang: string): string | null {
	const m = /^\s*(`{3,}|~{3,})\s*(\S+)\s*(.*)$/.exec(fenceLine);
	if (!m || m[2] !== lang) return null;
	return m[3].trim() || null;
}

/**
 * Given all lines of a note and the fence range of a prompt block, returns the note's
 * lines with `run` added to that block's history.
 */
export function appendRunToBlock(lines: string[], lineStart: number, lineEnd: number, run: PromptRun): string[] {
	const body = lines.slice(lineStart + 1, lineEnd);
	const insert = findHistorySeparator(body) === -1 ? ["---", formatRunLine(run)] : [formatRunLine(run)];
	// Drop trailing blank lines so the history stays tight against the closing fence.
	let end = lineEnd;
	while (end > lineStart + 1 && lines[end - 1].trim() === "") end--;
	return [...lines.slice(0, end), ...insert, ...lines.slice(lineEnd)];
}

/** Keeps text on one line and out of the fence syntax (a backtick would end the info string). */
function fenceSafe(text: string): string {
	return text.replace(/[`\r\n]+/g, " ").trim();
}

export function formatSessionBlock(opts: { sessionId: string; name?: string; title?: string }): string {
	const title = opts.title ? fenceSafe(opts.title) : "";
	const head = "```" + SESSION_LANG + (title ? " " + title : "");
	const lines = [head];
	const name = opts.name ? fenceSafe(opts.name) : "";
	if (name) lines.push(`Session name:      ${name}`);
	lines.push(`Session ID:        ${opts.sessionId}`);
	lines.push("```");
	return lines.join("\n");
}

/** Local time as `YYYY-MM-DD HH:MM`. */
export function formatRunTime(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
