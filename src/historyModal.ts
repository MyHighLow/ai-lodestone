import { FuzzySuggestModal, type FuzzyMatch } from "obsidian";
import type LodestonePlugin from "./main";
import { ENV_LABEL, type HistoryEntry } from "./types";
import { relativeTime } from "./util";

const SOURCE_LABEL: Record<HistoryEntry["source"], string> = {
	note: "note",
	prompt: "prompt block",
	resume: "resumed",
};

/** Every session Lodestone has launched or resumed. Enter resumes; Mod+Enter inserts a block. */
export class HistoryModal extends FuzzySuggestModal<HistoryEntry> {
	private insert = false;

	constructor(private plugin: LodestonePlugin) {
		super(plugin.app);
		this.setPlaceholder("Search sessions by title, note or ID");
		this.setInstructions([
			{ command: "↵", purpose: "resume" },
			{ command: "ctrl ↵", purpose: "insert session block" },
			{ command: "esc", purpose: "dismiss" },
		]);
		this.scope.register(["Mod"], "Enter", (evt) => {
			this.insert = true;
			// `chooser` isn't in the public typings, but it's how SuggestModal picks the highlighted item.
			(this as unknown as { chooser: { useSelectedItem(e: KeyboardEvent): void } }).chooser.useSelectedItem(evt);
			return false;
		});
	}

	getItems(): HistoryEntry[] {
		return this.plugin.history;
	}

	getItemText(item: HistoryEntry): string {
		return `${item.title} ${item.notePath ?? ""} ${item.sessionId}`;
	}

	renderSuggestion(match: FuzzyMatch<HistoryEntry>, el: HTMLElement) {
		const item = match.item;
		el.addClass("lodestone-suggestion");
		el.createDiv({ cls: "lodestone-suggestion-title", text: item.title });
		const bits = [ENV_LABEL[item.env], relativeTime(item.time), SOURCE_LABEL[item.source]];
		if (item.notePath) bits.push(item.notePath);
		el.createDiv({ cls: "lodestone-suggestion-meta", text: bits.join(" · ") });
	}

	onChooseItem(item: HistoryEntry) {
		if (this.insert) this.plugin.insertSessionBlockAtCursor(item);
		else void this.plugin.resume(item.sessionId, { env: item.env, title: item.title, notePath: item.notePath });
	}
}
