import { FileSystemAdapter, MarkdownView, Menu, Notice, Plugin, TFile, type Editor } from "obsidian";
import * as path from "path";
import { registerPromptBlock } from "./blocks/promptBlock";
import { registerSessionBlock } from "./blocks/sessionBlock";
import { HistoryModal } from "./historyModal";
import { launchInTerminal } from "./launcher";
import { formatSessionBlock, PROMPT_LANG, UUID_RE, parseSessionBody } from "./parse";
import { buildCopyCommand, newSessionArgs, resumeArgs, windowsToWsl, type LaunchSpec } from "./scripts";
import { SessionStore, type SessionInfo } from "./sessions";
import { LodestoneSettingTab } from "./settings";
import { DEFAULT_SETTINGS, ENV_LABEL, type Env, type HistoryEntry, type LaunchSource, type LodestoneSettings, type PluginData } from "./types";
import { wslToWindows } from "./util";

export interface NewLaunch {
	env: Env;
	/** Windows path of the working directory. */
	cwd: string;
	prompt?: string;
	title: string;
	source: LaunchSource;
	notePath?: string;
}

export interface ResolvedResume {
	spec: LaunchSpec;
	title: string;
	info: SessionInfo | null;
}

export default class LodestonePlugin extends Plugin {
	settings: LodestoneSettings = { ...DEFAULT_SETTINGS };
	history: HistoryEntry[] = [];
	sessions = new SessionStore(() => this.settings);
	private headerButtons = new WeakMap<MarkdownView, HTMLElement>();
	private envListeners = new Set<() => void>();

	async onload() {
		const data = ((await this.loadData()) ?? {}) as Partial<PluginData>;
		this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
		this.history = data.history ?? [];

		registerSessionBlock(this);
		registerPromptBlock(this);
		this.addSettingTab(new LodestoneSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => this.addHeaderButtons());
		this.registerEvent(this.app.workspace.on("layout-change", () => this.addHeaderButtons()));

		this.addCommand({
			id: "launch-with-note",
			name: "Launch Claude with current note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) void this.launchFromNote(file, this.settings.defaultEnv);
				return true;
			},
		});
		this.addCommand({
			id: "insert-session-block",
			name: "Insert Claude session block",
			editorCallback: (editor) => void this.insertSessionBlock(editor),
		});
		this.addCommand({
			id: "insert-prompt-block",
			name: "Insert Claude prompt block",
			editorCallback: (editor) => {
				const cursor = editor.getCursor();
				editor.replaceSelection("```" + PROMPT_LANG + " Title\n\n```\n");
				editor.setCursor({ line: cursor.line + 1, ch: 0 });
			},
		});
		this.addCommand({
			id: "browse-sessions",
			name: "Browse recent sessions",
			callback: () => new HistoryModal(this).open(),
		});
	}

	onunload() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView) this.headerButtons.get(leaf.view)?.remove();
		}
	}

	async save() {
		await this.saveData({ settings: this.settings, history: this.history } satisfies PluginData);
	}

	// ---- environment default -------------------------------------------------

	async setDefaultEnv(env: Env) {
		if (this.settings.defaultEnv === env) return;
		this.settings.defaultEnv = env;
		await this.save();
		this.envListeners.forEach((fn) => fn());
	}

	/** Subscribe to default-env changes; returns an unsubscribe function. */
	onDefaultEnvChange(fn: () => void): () => void {
		this.envListeners.add(fn);
		return () => this.envListeners.delete(fn);
	}

	/** Context menu offering PowerShell / WSL; the current default is checked. */
	showEnvMenu(evt: MouseEvent, verb: string, onPick: (env: Env) => void, checked: Env = this.settings.defaultEnv) {
		evt.preventDefault();
		const menu = new Menu();
		for (const env of ["powershell", "wsl"] as Env[]) {
			menu.addItem((item) =>
				item
					.setTitle(`${verb} in ${ENV_LABEL[env]}`)
					.setIcon(env === "wsl" ? "terminal-square" : "terminal")
					.setChecked(env === checked)
					.onClick(() => onPick(env)),
			);
		}
		menu.showAtMouseEvent(evt);
	}

	/** Pick an env from the menu, make it the default, then run `action` in it. */
	showDefaultEnvMenu(evt: MouseEvent, verb: string, action: (env: Env) => void) {
		this.showEnvMenu(evt, verb, (env) => {
			void this.setDefaultEnv(env);
			action(env);
		});
	}

	// ---- header button -------------------------------------------------------

	private addHeaderButtons() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || this.headerButtons.has(view)) continue;
			const button = view.addAction("bot", this.headerTooltip(), () => {
				if (view.file) void this.launchFromNote(view.file, this.settings.defaultEnv);
			});
			button.addClass("lodestone-header-button");
			button.addEventListener("contextmenu", (evt) =>
				this.showDefaultEnvMenu(evt, "Open Claude", (env) => view.file && void this.launchFromNote(view.file, env)),
			);
			const unsubscribe = this.onDefaultEnvChange(() => button.setAttribute("aria-label", this.headerTooltip()));
			view.register(unsubscribe);
			this.headerButtons.set(view, button);
		}
	}

	private headerTooltip() {
		return `Open Claude with this note (${ENV_LABEL[this.settings.defaultEnv]}). Right-click to choose.`;
	}

	// ---- paths -----------------------------------------------------------------

	vaultBasePath(): string {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) throw new Error("Lodestone needs a desktop vault.");
		return adapter.getBasePath();
	}

	/** Absolute (Windows) path of a vault file. */
	absolutePath(vaultPath: string): string {
		return path.join(this.vaultBasePath(), vaultPath);
	}

	/** Absolute (Windows) path of the folder containing a vault file. */
	noteFolder(vaultPath: string): string {
		return path.dirname(this.absolutePath(vaultPath));
	}

	toEnvPath(windowsPath: string, env: Env): string {
		return env === "wsl" ? windowsToWsl(windowsPath, this.settings.wslMountRoot) : windowsPath;
	}

	/** Expands {{file}}, {{path}}, {{vaultPath}} for a note, in the target env's path style. */
	expandTemplate(text: string, vaultPath: string | undefined, env: Env): string {
		if (!vaultPath) return text;
		return text
			.replace(/\{\{file\}\}/g, path.basename(vaultPath))
			.replace(/\{\{path\}\}/g, this.toEnvPath(this.absolutePath(vaultPath), env))
			.replace(/\{\{vaultPath\}\}/g, vaultPath);
	}

	// ---- launching ---------------------------------------------------------------

	async launchFromNote(file: TFile, env: Env) {
		await this.launchNew({
			env,
			cwd: this.noteFolder(file.path),
			prompt: this.expandTemplate(this.settings.notePromptTemplate, file.path, env),
			title: file.basename,
			source: "note",
			notePath: file.path,
		});
	}

	newSessionSpec(opts: Omit<NewLaunch, "source">, sessionId?: string): LaunchSpec {
		const name = this.settings.nameSessions ? opts.title : undefined;
		const args = newSessionArgs({ sessionId, prompt: opts.prompt, name });
		return { env: opts.env, cwd: this.toEnvPath(opts.cwd, opts.env), args };
	}

	/** Starts a new session in a new terminal window; returns its session ID, or null on failure. */
	async launchNew(opts: NewLaunch): Promise<string | null> {
		const sessionId = crypto.randomUUID();
		const spec = this.newSessionSpec(opts, sessionId);
		try {
			await launchInTerminal(spec, opts.title, this.settings);
		} catch (e) {
			new Notice(`Lodestone: couldn't launch Claude: ${(e as Error).message}`);
			return null;
		}
		new Notice(`Claude started in ${ENV_LABEL[opts.env]}`);
		await this.record({ sessionId, env: opts.env, cwd: spec.cwd, title: opts.title, source: opts.source, notePath: opts.notePath });
		return sessionId;
	}

	/**
	 * Works out where and how to resume a session. The env is, in order: the explicit override,
	 * the store the transcript was found in, the launch history, the default. The cwd comes from
	 * the transcript, then history, then the fallback folder.
	 */
	async resolveResume(sessionId: string, opts: { env?: Env; fallbackCwd?: string; title?: string }): Promise<ResolvedResume> {
		const info = await this.sessions.lookup(sessionId);
		const past = this.history.find((h) => h.sessionId === sessionId);
		const env = opts.env ?? info?.env ?? past?.env ?? this.settings.defaultEnv;
		const knownCwd = info?.cwd ?? past?.cwd;
		const cwd = (knownCwd && this.convertCwd(knownCwd, env)) ?? (opts.fallbackCwd ? this.toEnvPath(opts.fallbackCwd, env) : undefined);
		const title = opts.title ?? info?.title ?? past?.title ?? sessionId.slice(0, 8);
		return {
			spec: { env, cwd: cwd ?? (env === "wsl" ? "~" : this.vaultBasePath()), args: resumeArgs(sessionId) },
			title,
			info,
		};
	}

	/** Converts a cwd between path styles if needed; null if it can't be. */
	private convertCwd(cwd: string, env: Env): string | null {
		const isWindows = /^[A-Za-z]:[\\/]|^\\\\/.test(cwd);
		if (env === "wsl") return isWindows ? windowsToWsl(cwd, this.settings.wslMountRoot) : cwd;
		return isWindows ? cwd : wslToWindows(cwd, this.settings.wslMountRoot);
	}

	async resume(sessionId: string, opts: { env?: Env; fallbackCwd?: string; title?: string; notePath?: string } = {}) {
		const { spec, title } = await this.resolveResume(sessionId, opts);
		try {
			await launchInTerminal(spec, title, this.settings);
		} catch (e) {
			new Notice(`Lodestone: couldn't resume: ${(e as Error).message}`);
			return;
		}
		const past = this.history.find((h) => h.sessionId === sessionId);
		await this.record({
			sessionId,
			env: spec.env,
			cwd: spec.cwd,
			title,
			source: past?.source ?? "resume",
			notePath: past?.notePath ?? opts.notePath,
		});
	}

	async copyResumeCommand(sessionId: string, opts: { env?: Env; fallbackCwd?: string } = {}) {
		const { spec } = await this.resolveResume(sessionId, opts);
		await this.copy(buildCopyCommand(spec, this.claudeCmd(spec.env)), "Resume command copied");
	}

	claudeCmd(env: Env): string {
		return env === "wsl" ? this.settings.claudeCommandWsl : this.settings.claudeCommandPowershell;
	}

	async copy(text: string, message = "Copied") {
		await navigator.clipboard.writeText(text);
		new Notice(message);
	}

	/** Adds or bumps a session in the launch history (most recent first). */
	private async record(entry: Omit<HistoryEntry, "time">) {
		this.history = [{ ...entry, time: new Date().toISOString() }, ...this.history.filter((h) => h.sessionId !== entry.sessionId)].slice(
			0,
			Math.max(1, this.settings.historyLimit),
		);
		await this.save();
	}

	// ---- editor helpers --------------------------------------------------------

	private async insertSessionBlock(editor: Editor) {
		let clip = "";
		try {
			clip = await navigator.clipboard.readText();
		} catch {
			// clipboard unavailable; insert an empty block
		}
		const parsed = UUID_RE.test(clip) ? parseSessionBody(clip) : null;
		const cursor = editor.getCursor();
		if (parsed?.sessionId) {
			editor.replaceSelection(formatSessionBlock({ sessionId: parsed.sessionId, name: parsed.name ?? undefined }) + "\n");
		} else {
			editor.replaceSelection("```claude-session\nSession ID:        \n```\n");
			editor.setCursor({ line: cursor.line + 1, ch: "Session ID:        ".length });
		}
	}

	insertSessionBlockAtCursor(entry: HistoryEntry) {
		const editor = this.app.workspace.activeEditor?.editor;
		if (!editor) {
			new Notice("Open a note to insert the session block into.");
			return;
		}
		editor.replaceSelection(formatSessionBlock({ sessionId: entry.sessionId, title: entry.title }) + "\n");
	}
}
