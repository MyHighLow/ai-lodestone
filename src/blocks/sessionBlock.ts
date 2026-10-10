import type LodestonePlugin from "../main";
import type { Env } from "../types";
import { LODESTONE_ICON } from "../icon";
import { parseSessionBody, SESSION_LANG } from "../parse";
import { relativeTime, truncate } from "../util";
import { button, cardHeader, envBadge, fenceTitle, isolate } from "./common";

export function registerSessionBlock(plugin: LodestonePlugin) {
	plugin.registerMarkdownCodeBlockProcessor(SESSION_LANG, (source, el, ctx) => {
		const block = parseSessionBody(source);
		const override = fenceTitle(el, ctx, SESSION_LANG);
		const card = el.createDiv({ cls: "lodestone-card lodestone-session" });
		isolate(card);

		const { titleEl, right } = cardHeader(card, LODESTONE_ICON, override ?? block.name ?? "Claude session");
		if (!block.sessionId) {
			card.createDiv({
				cls: "lodestone-error",
				text: "No session ID found. Paste the output of /status (or just the session ID) into this block.",
			});
			return;
		}
		const sessionId = block.sessionId;
		const badgeSlot = right.createSpan();
		badgeSlot.createSpan({ cls: "lodestone-badge", text: "…" });

		const sub = card.createDiv({ cls: "lodestone-sub" });
		if (override && block.name) sub.createSpan({ text: block.name });
		sub.createSpan({ cls: "lodestone-mono", text: sessionId });

		const meta = card.createDiv({ cls: "lodestone-meta" });
		const snippet = card.createDiv({ cls: "lodestone-snippet" });

		const actions = card.createDiv({ cls: "lodestone-actions" });
		const resumeBtn = button(actions, { text: "Resume", icon: "play", cta: true, tooltip: "Right-click to change where it opens" });
		const copyBtn = button(actions, { text: "Copy command", icon: "copy" });

		const fallbackCwd = () => plugin.noteFolder(ctx.sourcePath);
		const title = () => titleEl.textContent ?? undefined;

		resumeBtn.addEventListener("click", () =>
			void plugin.resume(sessionId, { fallbackCwd: fallbackCwd(), title: title(), notePath: ctx.sourcePath }),
		);
		// Existing sessions resume in the shell that owns them, once the transcript is found.
		let ownedBy: Env | undefined;
		resumeBtn.addEventListener("contextmenu", (evt) => plugin.showOpenSettingsMenu(evt, { ownedBy }));
		copyBtn.addEventListener("click", () => void plugin.copyResumeCommand(sessionId, { fallbackCwd: fallbackCwd() }));
		copyBtn.addEventListener("contextmenu", (evt) => plugin.showOpenSettingsMenu(evt, { ownedBy }));

		void plugin.sessions.lookup(sessionId).then((info) => {
			badgeSlot.empty();
			if (!info) {
				envBadge(badgeSlot, null).setAttribute("aria-label", "No transcript for this ID in the Windows or WSL ~/.claude store");
				meta.setText("Transcript not found. Resume will use your default terminal and this note's folder.");
				return;
			}
			ownedBy = info.env;
			envBadge(badgeSlot, info.env);
			if (!override && !block.name && (info.title || info.firstPrompt)) {
				titleEl.setText(info.title ?? truncate(info.firstPrompt!, 80));
			}
			const parts: string[] = [];
			if (info.lastTime) parts.push(`active ${relativeTime(info.lastTime)}`);
			parts.push(`${info.promptCount} prompt${info.promptCount === 1 ? "" : "s"}`);
			if (info.gitBranch && info.gitBranch !== "HEAD") parts.push(`⎇ ${info.gitBranch}`);
			meta.setText(parts.join(" · "));
			if (info.cwd) meta.createDiv({ cls: "lodestone-mono lodestone-cwd", text: info.cwd });
			const shown = info.lastPrompt ?? info.firstPrompt;
			if (shown) snippet.setText(`“${truncate(shown, 220)}”`);
			snippet.setAttribute("aria-label", info.lastPrompt && info.lastPrompt !== info.firstPrompt ? "Latest prompt" : "Prompt");
		});
	});
}
