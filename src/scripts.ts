// Pure functions that turn a launch request into shell scripts and copyable commands.
// Kept free of Obsidian and Node imports so they can be unit tested directly.
import type { Env } from "./types";

export interface LaunchSpec {
	env: Env;
	/** Working directory in the env's own path style (D:\… or /mnt/d/…). */
	cwd: string;
	/** Arguments after the claude command. */
	args: string[];
}

/** Args for a new session. Without a session ID, claude picks one (used for copied commands). */
export function newSessionArgs(opts: { sessionId?: string; prompt?: string; name?: string }): string[] {
	const args = opts.sessionId ? ["--session-id", opts.sessionId] : [];
	if (opts.name) args.push("--name", opts.name);
	if (opts.prompt) {
		if (opts.prompt.startsWith("-")) args.push("--");
		args.push(opts.prompt);
	}
	return args;
}

export function resumeArgs(sessionId: string): string[] {
	return ["--resume", sessionId];
}

/** D:\a\b → /mnt/d/a/b; \\wsl.localhost\Distro\home\x → /home/x. Linux paths pass through. */
export function windowsToWsl(p: string, mountRoot = "/mnt"): string {
	const unc = /^\\\\wsl(?:\.localhost|\$)\\[^\\]+(\\.*)?$/i.exec(p);
	if (unc) return (unc[1] ?? "\\").replace(/\\/g, "/");
	const drive = /^([A-Za-z]):[\\/]?(.*)$/.exec(p);
	if (!drive) return p.replace(/\\/g, "/");
	const root = mountRoot.replace(/\/+$/, "");
	const rest = drive[2].replace(/\\/g, "/").replace(/\/+$/, "");
	return `${root}/${drive[1].toLowerCase()}${rest ? "/" + rest : ""}`;
}

/** PowerShell single-quoted literal. PowerShell also treats curly single quotes as quotes. */
export function psQuote(s: string): string {
	return "'" + s.replace(/['\u2018\u2019\u201A\u201B]/g, (q) => q + q) + "'";
}

/** POSIX shell single-quoted literal. */
export function shQuote(s: string): string {
	return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Windows PowerShell 5.1 doesn't escape embedded double quotes when it builds a native
 * command line, so they'd be eaten. Pre-escape them the way the MSVC runtime parses them.
 */
export function escapeForLegacyNative(arg: string): string {
	let out = arg.replace(/(\\*)"/g, (_m, bs: string) => bs + bs + '\\"');
	// A trailing backslash would escape the closing quote PowerShell adds around args with spaces.
	if (/\s/.test(out)) out = out.replace(/(\\+)$/, "$1$1");
	return out;
}

function psCommand(claudeCmd: string, args: string[], legacy: boolean): string {
	const quoted = args.map((a) => psQuote(legacy ? escapeForLegacyNative(a) : a));
	return ["&", psQuote(claudeCmd), ...quoted].join(" ");
}

function shCommand(claudeCmd: string, args: string[]): string {
	// The command isn't quoted so users can set things like `npx claude` or an alias.
	return [claudeCmd, ...args.map(shQuote)].join(" ");
}

export interface ScriptOptions {
	claudeCmd: string;
	/** Path of the script itself, so it can delete itself once it has started. */
	selfPath?: string;
	/** True for Windows PowerShell 5.1 (powershell.exe). */
	legacyPowershell?: boolean;
}

/** A .ps1 file body. Runs under `-NoExit` so the window stays when claude exits. */
export function buildPowershellScript(spec: LaunchSpec, opts: ScriptOptions): string {
	const lines: string[] = [];
	if (opts.selfPath) lines.push(`Remove-Item -LiteralPath ${psQuote(opts.selfPath)} -ErrorAction SilentlyContinue`);
	lines.push(`Set-Location -LiteralPath ${psQuote(spec.cwd)}`);
	lines.push(psCommand(opts.claudeCmd, spec.args, !!opts.legacyPowershell));
	return lines.join("\r\n") + "\r\n";
}

/** A bash script body, sourced by `bash -lic` so nvm and ~/.local/bin are on PATH. */
export function buildBashScript(spec: LaunchSpec, opts: ScriptOptions): string {
	const lines: string[] = [];
	if (opts.selfPath) lines.push(`rm -f -- ${shQuote(opts.selfPath)}`);
	lines.push(`cd -- ${shQuote(spec.cwd)} || echo "lodestone: couldn't cd to ${spec.cwd.replace(/["$`\\]/g, "\\$&")}"`);
	lines.push(shCommand(opts.claudeCmd, spec.args));
	// Leave a shell open in the session's directory after claude exits.
	lines.push("exec bash -l");
	return lines.join("\n") + "\n";
}

/** A one-liner to paste into your own terminal. */
export function buildCopyCommand(spec: LaunchSpec, claudeCmd: string): string {
	if (spec.env === "wsl") return `cd ${shQuote(spec.cwd)} && ${shCommand(claudeCmd, spec.args)}`;
	return `cd ${psQuote(spec.cwd)}; ${psCommand(claudeCmd, spec.args, false)}`;
}

/** Text for a window title: cmd treats `"` and `%` specially even inside quotes, wt splits on `;`. */
export function consoleTitle(title: string): string {
	return title.replace(/["%^;\r\n]/g, "").slice(0, 80) || "Claude";
}

export type TerminalApp = "console" | "windows-terminal";

export interface StartOptions {
	title: string;
	/** The program and its arguments, already quoted for a Windows command line. */
	program: string;
	terminal: TerminalApp;
	/** Path to wt.exe; required for "windows-terminal". */
	wtExe?: string;
	/** Windows Terminal: true opens a new window, false a new tab in the last-used window. */
	wtNewWindow?: boolean;
}

/** The line run by `cmd /c` that opens the terminal. */
export function buildStartCommand(opts: StartOptions): string {
	const title = consoleTitle(opts.title);
	if (opts.terminal === "windows-terminal" && opts.wtExe) {
		// wt treats a bare `;` as a separator between its own subcommands.
		const program = opts.program.replace(/;/g, "\\;");
		const window = opts.wtNewWindow ? "new" : "0";
		return `start "" "${opts.wtExe}" -w ${window} new-tab --title "${title}" ${program}`;
	}
	return `start "${title}" ${opts.program}`;
}
