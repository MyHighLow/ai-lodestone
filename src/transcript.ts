// Pure summarizer for Claude Code session transcripts (~/.claude/projects/<dir>/<id>.jsonl).

export interface TranscriptSummary {
	cwd?: string;
	gitBranch?: string;
	firstTime?: string;
	lastTime?: string;
	/** Prompts typed by the user (tool results and meta entries excluded). */
	promptCount: number;
	firstPrompt?: string;
	lastPrompt?: string;
	/** Best available name: /rename or --name, else the auto-generated title. */
	title?: string;
}

function userText(entry: any): string | null {
	if (entry.type !== "user" || entry.isSidechain || entry.isMeta) return null;
	const content = entry.message?.content;
	let text: string | null = null;
	if (typeof content === "string") text = content;
	else if (Array.isArray(content)) {
		if (content.some((c: any) => c?.type === "tool_result")) return null;
		text = content.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n") || null;
	}
	if (!text) return null;
	text = text.trim();
	// Slash commands, command output and system reminders aren't real prompts.
	if (!text || text.startsWith("<")) return null;
	return text;
}

export function summarizeTranscript(jsonl: string): TranscriptSummary {
	const s: TranscriptSummary = { promptCount: 0 };
	let customTitle: string | undefined;
	let agentName: string | undefined;
	let aiTitle: string | undefined;

	for (const line of jsonl.split("\n")) {
		if (!line.trim()) continue;
		let e: any;
		try {
			e = JSON.parse(line);
		} catch {
			continue; // a partially written last line
		}
		if (e.type === "custom-title" && e.customTitle) customTitle = e.customTitle;
		else if (e.type === "agent-name" && e.agentName) agentName = e.agentName;
		else if (e.type === "ai-title" && e.aiTitle) aiTitle = e.aiTitle;

		if (typeof e.cwd === "string" && !s.cwd) s.cwd = e.cwd;
		if (typeof e.gitBranch === "string" && e.gitBranch) s.gitBranch = e.gitBranch;
		if (typeof e.timestamp === "string" && (e.type === "user" || e.type === "assistant")) {
			s.firstTime ??= e.timestamp;
			s.lastTime = e.timestamp;
		}
		const text = userText(e);
		if (text) {
			s.promptCount++;
			s.firstPrompt ??= text;
			s.lastPrompt = text;
		}
	}
	s.title = customTitle ?? agentName ?? aiTitle;
	return s;
}
