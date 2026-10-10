import { MarkdownRenderChild, Menu, Notice, type MarkdownPostProcessorContext } from "obsidian";
import { LODESTONE_ICON } from "../icon";
import type LodestonePlugin from "../main";
import { appendRunToBlock, formatRunTime, formatSessionBlock, parsePromptBody, PROMPT_LANG, type PromptRun } from "../parse";
import { buildCopyCommand } from "../scripts";
import { ENV_LABEL, type Env } from "../types";
import { relativeTime, truncate } from "../util";
import { button, cardHeader, envBadge, fenceTitle, iconButton, isolate, setButtonText } from "./common";

const PREVIEW_CHARS = 400;

export function registerPromptBlock(plugin: LodestonePlugin) {
	plugin.registerMarkdownCodeBlockProcessor(PROMPT_LANG, (source, el, ctx) => {
		const { prompt, runs } = parsePromptBody(source);
		const title = fenceTitle(el, ctx, PROMPT_LANG);
		const card = el.createDiv({ cls: "lodestone-card lodestone-prompt" });
		isolate(card);

		const { right } = cardHeader(card, LODESTONE_ICON, title ?? "Claude prompt");
		right.createSpan({ cls: "lodestone-badge lodestone-badge-kind", text: "prompt" });

		if (!prompt) {
			card.createDiv({ cls: "lodestone-error", text: "Write the prompt for the new session inside this block." });
			return;
		}

		const text = card.createDiv({ cls: "lodestone-prompt-text", text: prompt });
		if (prompt.length > PREVIEW_CHARS || prompt.split("\n").length > 8) {
			text.addClass("is-collapsed");
			const toggle = card.createEl("a", { cls: "lodestone-toggle", text: "Show more" });
			toggle.addEventListener("click", () => {
				text.toggleClass("is-collapsed", !text.hasClass("is-collapsed"));
				toggle.setText(text.hasClass("is-collapsed") ? "Show more" : "Show less");
			});
		}

		const actions = card.createDiv({ cls: "lodestone-actions" });
		const runBtn = button(actions, { text: "", icon: "play", cta: true, tooltip: "Start a new session. Right-click to change where it opens" });
		const copyBtn = button(actions, { text: "Copy command", icon: "copy" });
		const updateLabel = () => setButtonText(runBtn, `Run in ${ENV_LABEL[plugin.settings.defaultEnv]}`);
		updateLabel();

		const child = new MarkdownRenderChild(el);
		ctx.addChild(child);
		child.register(plugin.onDefaultEnvChange(updateLabel));

		const sessionName = title ?? truncate(prompt, 60);
		const launch = async (env: Env) => {
			const sessionId = await plugin.launchNew({
				env,
				cwd: plugin.noteFolder(ctx.sourcePath),
				prompt: plugin.expandTemplate(prompt, ctx.sourcePath, env),
				title: sessionName,
				source: "prompt",
				notePath: ctx.sourcePath,
			});
			if (sessionId) await recordRun(plugin, el, ctx, { time: formatRunTime(new Date()), env, sessionId });
		};
		runBtn.addEventListener("click", () => void launch(plugin.settings.defaultEnv));
		runBtn.addEventListener("contextmenu", (evt) => plugin.showOpenSettingsMenu(evt));

		const copyCommand = (env: Env) => {
			const spec = plugin.newSessionSpec({
				env,
				cwd: plugin.noteFolder(ctx.sourcePath),
				prompt: plugin.expandTemplate(prompt, ctx.sourcePath, env),
				title: sessionName,
			});
			void plugin.copy(buildCopyCommand(spec, plugin.claudeCmd(env)), `${ENV_LABEL[env]} command copied`);
		};
		copyBtn.addEventListener("click", () => copyCommand(plugin.settings.defaultEnv));
		copyBtn.addEventListener("contextmenu", (evt) => plugin.showOpenSettingsMenu(evt));

		if (runs.length) renderRuns(plugin, card, el, ctx, runs, title);
	});
}

function renderRuns(
	plugin: LodestonePlugin,
	card: HTMLElement,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	runs: PromptRun[],
	blockTitle: string | null,
) {
	const details = card.createEl("details", { cls: "lodestone-runs" });
	details.createEl("summary", { text: `Previous runs (${runs.length})` });
	const list = details.createDiv({ cls: "lodestone-run-list" });
	const fallbackCwd = () => plugin.noteFolder(ctx.sourcePath);
	const rows: { run: PromptRun; info: HTMLElement }[] = [];

	for (const run of [...runs].reverse()) {
		const row = list.createDiv({ cls: "lodestone-run" });
		row.createSpan({ cls: "lodestone-run-time", text: run.time });
		envBadge(row, run.env);
		const info = row.createSpan({ cls: "lodestone-run-info lodestone-mono", text: run.sessionId.slice(0, 8) });
		const buttons = row.createDiv({ cls: "lodestone-run-buttons" });
		const opts = () => ({ fallbackCwd: fallbackCwd(), notePath: ctx.sourcePath });

		iconButton(buttons, "play", "Resume").addEventListener("click", () => void plugin.resume(run.sessionId, opts()));
		iconButton(buttons, "copy", "Copy resume command").addEventListener("click", () => void plugin.copyResumeCommand(run.sessionId, opts()));
		row.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			const menu = new Menu();
			menu.addItem((i) => i.setTitle("Copy session ID").setIcon("hash").onClick(() => void plugin.copy(run.sessionId, "Session ID copied")));
			menu.addItem((i) =>
				i
					.setTitle("Insert as session block below")
					.setIcon("history")
					.onClick(() => void insertSessionBlockBelow(plugin, el, ctx, run, blockTitle)),
			);
			menu.showAtMouseEvent(evt);
		});
		rows.push({ run, info });
	}

	// Look up session details only when the list is first opened.
	let loaded = false;
	details.addEventListener("toggle", () => {
		if (!details.open || loaded) return;
		loaded = true;
		for (const { run, info } of rows) {
			void plugin.sessions.lookup(run.sessionId).then((s) => {
				if (!s) {
					info.setText(`${run.sessionId.slice(0, 8)} · not started or transcript missing`);
					return;
				}
				const bits = [run.sessionId.slice(0, 8), `${s.promptCount} prompt${s.promptCount === 1 ? "" : "s"}`];
				if (s.lastTime) bits.push(`active ${relativeTime(s.lastTime)}`);
				info.setText(bits.join(" · "));
				if (s.lastPrompt) info.setAttribute("aria-label", truncate(s.lastPrompt, 200));
			});
		}
	});
}

/** Edits this block in its note: verifies the block is still where the renderer saw it. */
async function editBlock(
	plugin: LodestonePlugin,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	edit: (lines: string[], lineStart: number, lineEnd: number) => string[],
): Promise<boolean> {
	const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
	const section = ctx.getSectionInfo(el);
	if (!file || !section) return false;
	let ok = false;
	await plugin.app.vault.process(file, (data) => {
		const eol = data.includes("\r\n") ? "\r\n" : "\n";
		const lines = data.split(/\r?\n/);
		const open = lines[section.lineStart] ?? "";
		const close = lines[section.lineEnd] ?? "";
		if (!open.includes(PROMPT_LANG) || !/^\s*(`{3,}|~{3,})\s*$/.test(close)) return data;
		ok = true;
		return edit(lines, section.lineStart, section.lineEnd).join(eol);
	});
	return ok;
}

async function recordRun(plugin: LodestonePlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext, run: PromptRun) {
	const ok = await editBlock(plugin, el, ctx, (lines, start, end) => appendRunToBlock(lines, start, end, run));
	if (!ok) new Notice("Lodestone: couldn't add the run to this block (it moved?). It's still in Browse recent sessions.");
}

async function insertSessionBlockBelow(
	plugin: LodestonePlugin,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	run: PromptRun,
	blockTitle: string | null,
) {
	const block = formatSessionBlock({ sessionId: run.sessionId, title: `${blockTitle ?? "Prompt run"} (${run.time})` });
	const ok = await editBlock(plugin, el, ctx, (lines, _start, end) => [...lines.slice(0, end + 1), "", ...block.split("\n"), ...lines.slice(end + 1)]);
	if (!ok) new Notice("Lodestone: couldn't find this block in the note to insert below it.");
}
