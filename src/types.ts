import type { TerminalApp } from "./scripts";

export type Env = "powershell" | "wsl";

export const ENV_LABEL: Record<Env, string> = {
	powershell: "PowerShell",
	wsl: "WSL",
};

export interface LodestoneSettings {
	defaultEnv: Env;
	/** Where sessions open. Windows Terminal falls back to a console window if it isn't installed. */
	terminalApp: TerminalApp;
	/** Windows Terminal: open a new window instead of a tab in the last-used window. */
	wtNewWindow: boolean;
	/** Path to wt.exe or WindowsTerminal.exe. Empty = auto-detect. */
	windowsTerminalPath: string;
	/** "auto" picks pwsh 7 when installed, else Windows PowerShell 5.1. */
	powershellExe: string;
	/** Empty = WSL's default distro. */
	wslDistro: string;
	wslMountRoot: string;
	claudeCommandPowershell: string;
	claudeCommandWsl: string;
	/** Empty = ~/.claude/projects of the Windows user. */
	windowsProjectsDir: string;
	/** Empty = auto-detect via `wslpath`. */
	wslProjectsDir: string;
	/** Prompt sent by the header button. Placeholders: {{file}}, {{path}}, {{vaultPath}}. */
	notePromptTemplate: string;
	/** Name sessions after the note / prompt-block title (`claude --name`). */
	nameSessions: boolean;
	historyLimit: number;
}

export const DEFAULT_SETTINGS: LodestoneSettings = {
	defaultEnv: "powershell",
	terminalApp: "windows-terminal",
	wtNewWindow: false,
	windowsTerminalPath: "",
	powershellExe: "auto",
	wslDistro: "",
	wslMountRoot: "/mnt",
	claudeCommandPowershell: "claude",
	claudeCommandWsl: "claude",
	windowsProjectsDir: "",
	wslProjectsDir: "",
	notePromptTemplate:
		'Read the note "{{file}}" (full path: {{path}}) into context. Don\'t act on it yet: wait for me to give you further instructions.',
	nameSessions: true,
	historyLimit: 200,
};

export type LaunchSource = "note" | "prompt" | "resume";

export interface HistoryEntry {
	sessionId: string;
	env: Env;
	/** Working directory, in the env's own path style. */
	cwd: string;
	title: string;
	source: LaunchSource;
	/** Vault path of the note the launch came from. */
	notePath?: string;
	/** ISO timestamp of the latest launch or resume. */
	time: string;
}

export interface PluginData {
	settings: LodestoneSettings;
	history: HistoryEntry[];
}
