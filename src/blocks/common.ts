import { setIcon, type MarkdownPostProcessorContext } from "obsidian";
import { titleFromFence } from "../parse";
import { ENV_LABEL, type Env } from "../types";

export function fenceTitle(el: HTMLElement, ctx: MarkdownPostProcessorContext, lang: string): string | null {
	const section = ctx.getSectionInfo(el);
	if (!section) return null;
	const line = section.text.split(/\r?\n/)[section.lineStart] ?? "";
	return titleFromFence(line, lang);
}

export function button(parent: HTMLElement, opts: { text: string; icon: string; cta?: boolean; tooltip?: string }): HTMLButtonElement {
	const b = parent.createEl("button", { cls: "lodestone-btn" + (opts.cta ? " mod-cta" : "") });
	const icon = b.createSpan({ cls: "lodestone-btn-icon" });
	setIcon(icon, opts.icon);
	b.createSpan({ cls: "lodestone-btn-text", text: opts.text });
	if (opts.tooltip) b.setAttribute("aria-label", opts.tooltip);
	return b;
}

export function setButtonText(b: HTMLButtonElement, text: string) {
	const span = b.querySelector(".lodestone-btn-text");
	if (span) span.textContent = text;
}

export function iconButton(parent: HTMLElement, icon: string, tooltip: string): HTMLElement {
	const b = parent.createEl("button", { cls: "lodestone-icon-btn clickable-icon", attr: { "aria-label": tooltip } });
	setIcon(b, icon);
	return b;
}

export function envBadge(parent: HTMLElement, env: Env | null): HTMLElement {
	return parent.createSpan({
		cls: `lodestone-badge lodestone-badge-${env ?? "missing"}`,
		text: env ? ENV_LABEL[env] : "not found",
	});
}

export function cardHeader(card: HTMLElement, icon: string, title: string): { titleEl: HTMLElement; right: HTMLElement } {
	const header = card.createDiv({ cls: "lodestone-header" });
	setIcon(header.createSpan({ cls: "lodestone-header-icon" }), icon);
	const titleEl = header.createDiv({ cls: "lodestone-title", text: title });
	const right = header.createDiv({ cls: "lodestone-header-right" });
	return { titleEl, right };
}

/** Stops clicks in the card from putting the cursor into the block in Live Preview. */
export function isolate(card: HTMLElement) {
	card.addEventListener("mousedown", (e) => {
		if ((e.target as HTMLElement).closest("button, summary, a")) e.stopPropagation();
	});
}
