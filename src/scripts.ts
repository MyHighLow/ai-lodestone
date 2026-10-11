// Pure functions that turn a launch request into shell scripts and copyable commands.
// Kept free of Obsidian and Node imports so they can be unit tested directly.
// Explicit extension: the unit tests load this module straight into node.
import { stripInvisible } from "./sanitize.ts";
import type { Env } from "./types";

export interface LaunchSpec {
	env: Env;
	/** Working directory in the env's own path style (D:\… or /mnt/d/…). */
	cwd: string;
	/** Arguments after the claude command. */
	args: string[];
}

/**
 * Args for a new session. Without a session ID, claude picks one (used for copied commands).
 * The prompt always comes after `--`: if a shell ever splits it (old PowerShell quoting can,
 * on a `"`), the pieces are still positional text and can never become claude options.
 */
export function newSessionArgs(opts: { sessionId?: string; prompt?: string; name?: string }): string[] {
	const args = opts.sessionId ? ["--session-id", opts.sessionId] : [];
	const name = opts.name ? sessionNameArg(opts.name) : "";
	// One token, so no shell can separate the option from its value.
	if (name) args.push(`--name=${name}`);
	// Last line of defense: whatever built the prompt (placeholders, templates), nothing
	// invisible reaches claude.
	const prompt = opts.prompt ? stripInvisible(opts.prompt).text : "";
	if (prompt) args.push("--", prompt);
	return args;
}

/**
 * The name sits before `--`, so it gets no `"` (the splitting risk), no trailing `\`, and no
 * invisible or text-direction characters (they could spoof names in claude's /resume list).
 */
export function sessionNameArg(name: string): string {
	return stripInvisible(name)
		.text.replace(/["\x00-\x1f\x7f-\x9f]/g, "")
		.trim()
		.replace(/\\+$/, "")
		.trim();
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
 * PowerShell before 7.3 (and Legacy mode) doesn't escape embedded double quotes when it
 * builds a native command line, so they'd be eaten. Pre-escape them the way the MSVC
 * runtime parses them.
 */
export function escapeForLegacyNative(arg: string): string {
	let out = arg.replace(/(\\*)"/g, (_m, bs: string) => bs + bs + '\\"');
	// A trailing backslash would escape the closing quote PowerShell adds around args with spaces.
	// U+0085 too: .NET counts it as whitespace when deciding to add those quotes; JS \s doesn't.
	if (/[\s\u0085]/.test(out)) out = out.replace(/(\\+)$/, "$1$1");
	return out;
}



function shCommand(claudeCmd: string, args: string[]): string {
	// The command isn't quoted so users can set things like `npx claude` or an alias.
	return [claudeCmd, ...args.map(shQuote)].join(" ");
}

export interface ScriptOptions {
	claudeCmd: string;
	/** Path of the script itself, so it can delete itself once it has started. */
	selfPath?: string;
}

/**
 * Quotes one argument the way Windows programs (the MSVC runtime, CommandLineToArgvW) split
 * a command line: wrap in quotes, escape `"`, and double the backslashes that precede a `"`
 * or the closing quote.
 */
export function windowsArg(arg: string): string {
	if (arg && !/[\s"]/.test(arg)) return arg;
	let out = '"';
	let backslashes = 0;
	for (const ch of arg) {
		if (ch === "\\") {
			backslashes++;
			continue;
		}
		out += "\\".repeat(ch === '"' ? backslashes * 2 + 1 : backslashes) + ch;
		backslashes = 0;
	}
	return out + "\\".repeat(backslashes * 2) + '"';
}

/** Escapes PowerShell wildcard characters, so Get-Command -Name takes the name literally. */
function psWildcardEscape(name: string): string {
	return name.replace(/[*?[\]`]/g, "`$&");
}

/**
 * PowerShell that sets $resolved to the claude to run, or $null. Only real programs
 * (.exe, .com) and PowerShell scripts qualify: aliases and functions are skipped, and so are
 * .cmd/.bat shims (cmd.exe would re-parse the prompt) and anything else Windows hands to
 * another program (.vbs, .js, a trailing-dot name…). The caller then runs $resolved itself,
 * never the name again, so what runs is what was checked.
 */
export function psResolveClaude(claudeCmd: string): string {
	const name = psQuote(psWildcardEscape(claudeCmd));
	return `$resolved = @(Get-Command -Name ${name} -CommandType Application,ExternalScript -All -ErrorAction SilentlyContinue) | Where-Object { $_.CommandType -eq 'ExternalScript' -or $_.Path -match '\\.(exe|com)$' } | Select-Object -First 1`;
}

function notFoundMessage(claudeCmd: string): string {
	return `AI Lodestone found no claude.exe or claude.ps1 for "${claudeCmd}". Batch-file shims (.cmd, .bat) are refused because cmd.exe would re-parse the prompt. Set AI Lodestone's "Claude command (PowerShell)" to the full path of claude.exe.`;
}

const LEGACY_SCRIPT_MESSAGE =
	"This PowerShell can't pass the prompt's double quotes (or a trailing backslash) through a claude.ps1 script intact, so AI Lodestone didn't start it. Use PowerShell 7.3 or later, or point AI Lodestone's \"Claude command (PowerShell)\" at claude.exe.";

/**
 * A .ps1 file body. Runs under `-NoExit` so the window stays when claude exits.
 *
 * What it does depends on the PowerShell that runs it and on what `claude` resolves to:
 * - A .cmd/.bat shim is refused: PowerShell runs those through cmd.exe, which would
 *   re-parse the prompt (%VARS%, `&`, `|`), so a note's text could run as commands.
 * - A PowerShell script (npm's claude.ps1) gets the arguments as they are: PowerShell
 *   passes them to scripts without any command-line quoting.
 * - A native claude.exe:
 *   - Windows PowerShell 5.1 mishandles `"` inside arguments in a way no pre-escaping fixes,
 *     so the script starts claude.exe itself with a command line built by windowsArg.
 *   - PowerShell 6–7.2, or 7.3+ in Legacy mode, doesn't escape `"` but quotes correctly
 *     otherwise, so it gets pre-escaped arguments.
 *   - PowerShell 7.3+ passes arguments correctly as they are.
 */
export function buildPowershellScript(spec: LaunchSpec, opts: ScriptOptions): string {
	const lines: string[] = [];
	if (opts.selfPath) lines.push(`Remove-Item -LiteralPath ${psQuote(opts.selfPath)} -ErrorAction SilentlyContinue`);
	lines.push(`Set-Location -LiteralPath ${psQuote(spec.cwd)}`);
	lines.push(psResolveClaude(opts.claudeCmd));
	lines.push(`if (-not $resolved) {`);
	lines.push(`  Write-Host ${psQuote(notFoundMessage(opts.claudeCmd))} -ForegroundColor Red`);
	lines.push(`  return`);
	lines.push(`}`);
	lines.push(String.raw`$native = $resolved.CommandType -eq 'Application'`);
	lines.push(String.raw`if ($native -and $PSVersionTable.PSEdition -ne 'Core') {`);
	lines.push(`  $psi = New-Object System.Diagnostics.ProcessStartInfo`);
	lines.push(String.raw`  $psi.FileName = $resolved.Path`);
	lines.push(`  $psi.Arguments = ${psQuote(spec.args.map(windowsArg).join(" "))}`);
	// Set-Location only moves PowerShell's own location, not the process's working directory.
	lines.push(`  $psi.WorkingDirectory = ${psQuote(spec.cwd)}`);
	lines.push(String.raw`  $psi.UseShellExecute = $false`);
	lines.push(String.raw`  [System.Diagnostics.Process]::Start($psi).WaitForExit()`);
	const legacyArgs = spec.args.map(escapeForLegacyNative);
	if (legacyArgs.some((a, i) => a !== spec.args[i])) {
		const legacy = String.raw`($PSVersionTable.PSVersion -lt [version]'7.3' -or $PSNativeCommandArgumentPassing -eq 'Legacy')`;
		lines.push(`} elseif ($native -and ${legacy}) {`);
		lines.push(`  & $resolved ${legacyArgs.map(psQuote).join(" ")}`);
		// A .ps1 (like npm's claude.ps1) hands the arguments on to node.exe itself, with this
		// PowerShell's quoting, and that can't be pre-escaped reliably on 5.1. Refuse rather
		// than send a different prompt.
		lines.push(`} elseif (${legacy}) {`);
		lines.push(`  Write-Host ${psQuote(LEGACY_SCRIPT_MESSAGE)} -ForegroundColor Red`);
	}
	lines.push(`} else {`);
	lines.push(`  & $resolved ${spec.args.map(psQuote).join(" ")}`);
	lines.push(`}`);
	return lines.join("\r\n") + "\r\n";
}

/** A bash script body, sourced by `bash -lic` so nvm and ~/.local/bin are on PATH. */
export function buildBashScript(spec: LaunchSpec, opts: ScriptOptions): string {
	const lines: string[] = [];
	if (opts.selfPath) lines.push(`rm -f -- ${shQuote(opts.selfPath)}`);
	lines.push(`cd -- ${shQuote(spec.cwd)} || printf 'ai-lodestone: could not cd to %s\\n' ${shQuote(spec.cwd)}`);
	lines.push(shCommand(opts.claudeCmd, spec.args));
	// Leave a shell open in the session's directory after claude exits.
	lines.push("exec bash -l");
	return lines.join("\n") + "\n";
}

/** A one-liner to paste into your own terminal. */
export function buildCopyCommand(spec: LaunchSpec, claudeCmd: string): string {
	if (spec.env === "wsl") return `cd ${shQuote(spec.cwd)} && ${shCommand(claudeCmd, spec.args)}`;
	// Same lookup as the launch script, so a pasted command never reaches a batch shim.
	const run = `& $resolved ${spec.args.map(psQuote).join(" ")}`;
	return `cd ${psQuote(spec.cwd)}; ${psResolveClaude(claudeCmd)}; if ($resolved) { ${run} } else { Write-Error ${psQuote(notFoundMessage(claudeCmd))} }`;
}

/**
 * A window title that can't break out of its quotes or be rewritten: no `"`, no `;` (wt
 * subcommands), no `%` (Windows Terminal expands %VARS%), no control or invisible characters.
 */
export function consoleTitle(title: string): string {
	const visible = stripInvisible(title).text;
	return visible.replace(/["%;\x00-\x1f\x7f]/g, "").trim().slice(0, 80) || "Claude";
}

export type TerminalApp = "console" | "windows-terminal";

export type LaunchTarget =
	| { env: "powershell"; exe: string; scriptPath: string }
	/** `scriptPath` is the script's path inside WSL. */
	| { env: "wsl"; distro?: string; scriptPath: string };

export interface LaunchCommandOptions {
	target: LaunchTarget;
	title: string;
	terminal: TerminalApp;
	/** Path to wt.exe; used when `terminal` is "windows-terminal". */
	wtExe?: string;
	/** Windows Terminal: true opens a new window, false a new tab in the last-used window. */
	wtNewWindow?: boolean;
}

export interface LaunchCommand {
	/** For `cmd /d /s /c "<commandLine>"`. Holds only fixed text and %LODESTONE_*% references. */
	commandLine: string;
	/** Environment variables the command line refers to. */
	vars: Record<string, string>;
	/** The terminal actually used. */
	terminal: TerminalApp;
	/** Why Windows Terminal was requested but not used, when it was available. */
	fallbackReason?: string;
}

/**
 * Builds the `cmd /c` line that opens the terminal. Every variable part (paths, distro,
 * title) goes in through an environment variable rather than being pasted into the line:
 * cmd expands %VAR% once, before parsing, and never re-expands the result. So a `%`, `&`,
 * `^` or `'` in a value (say, from the Windows user name inside the temp path) is just text.
 * Each reference sits inside double quotes, so values only need to be free of `"`.
 *
 * Windows Terminal is different: it expands %VARS% in the command line it's given, again,
 * and has no way to escape `%`. So if a value wt would read contains `%`, the launch uses a
 * console window instead.
 */
export function buildLaunchCommand(opts: LaunchCommandOptions): LaunchCommand {
	const t = opts.target;
	const wtParsedValues = t.env === "powershell" ? [t.exe, t.scriptPath] : [t.distro ?? "", t.scriptPath];
	let wt = opts.terminal === "windows-terminal" && !!opts.wtExe;
	let fallbackReason: string | undefined;
	if (wt && wtParsedValues.some((v) => v.includes("%"))) {
		wt = false;
		fallbackReason = "a path contains %, which Windows Terminal would rewrite";
	}
	const vars: Record<string, string> = {};
	const ref = (name: string, value: string, label: string, wtParses = true): string => {
		if (/["\x00-\x1f]/.test(value)) throw new Error(`${label} can't contain quotes or control characters: ${value}`);
		// wt splits its own command line on `;`; `\;` is a literal semicolon.
		vars[`LODESTONE_${name}`] = wt && wtParses ? value.replace(/;/g, "\\;") : value;
		return `%LODESTONE_${name}%`;
	};

	const program =
		t.env === "powershell"
			? `"${ref("EXE", t.exe, "PowerShell path")}" -NoLogo -NoExit -ExecutionPolicy Bypass -File "${ref("SCRIPT", t.scriptPath, "Temp path")}"`
			: `wsl.exe ${t.distro ? `-d "${ref("DISTRO", t.distro, "WSL distro")}" ` : ""}--cd ~ --exec bash -lic "source ${ref("SCRIPT", shQuote(t.scriptPath), "Temp path")}"`;
	const title = ref("TITLE", consoleTitle(opts.title), "Title", false);

	if (wt) {
		const window = opts.wtNewWindow ? "new" : "0";
		const commandLine = `start "" "${ref("WT", opts.wtExe!, "Windows Terminal path", false)}" -w ${window} new-tab --title "${title}" ${program}`;
		return { commandLine, vars, terminal: "windows-terminal" };
	}
	return { commandLine: `start "${title}" ${program}`, vars, terminal: "console", fallbackReason };
}
