import { execFile, spawn } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildBashScript, buildLaunchCommand, buildPowershellScript, windowsToWsl, type LaunchSpec, type LaunchTarget, type TerminalApp } from "./scripts.ts";
import type { LodestoneSettings } from "./types";

/** Shown when launching off Windows, and once at load time there (main.ts). */
export const WINDOWS_ONLY = "AI Lodestone currently launches terminals on Windows only.";

const PWSH7 = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";

export function resolvePowershellExe(setting: string): string {
	if (setting && setting !== "auto") return setting;
	return fs.existsSync(PWSH7) ? PWSH7 : "powershell.exe";
}

/** `lstat`, not `stat`: the Store's wt.exe is an app execution alias that `stat` can't follow. */
function exists(p: string): boolean {
	try {
		fs.lstatSync(p);
		return true;
	} catch {
		return false;
	}
}

/** Prefer wt.exe (the command-line launcher) when given the path of WindowsTerminal.exe. */
function preferWtExe(p: string): string {
	const sibling = path.join(path.dirname(p), "wt.exe");
	return /windowsterminal\.exe$/i.test(p) && exists(sibling) ? sibling : p;
}

/** Install locations with a fixed path: the Store alias, winget and scoop. */
function findWindowsTerminalOnPath(): string | null {
	const { LOCALAPPDATA, USERPROFILE } = process.env;
	const candidates = [
		LOCALAPPDATA && path.join(LOCALAPPDATA, "Microsoft", "WindowsApps", "wt.exe"),
		LOCALAPPDATA && path.join(LOCALAPPDATA, "Microsoft", "WinGet", "Links", "wt.exe"),
		USERPROFILE && path.join(USERPROFILE, "scoop", "shims", "wt.exe"),
	];
	return candidates.find((c): c is string => !!c && exists(c)) ?? null;
}

/**
 * Portable (zip) installs live anywhere, so look for a Start Menu or taskbar shortcut
 * that points at Windows Terminal. Only those places: the Desktop and download folders are
 * where extracted archives and cloned repos land, and a shortcut planted there would
 * otherwise decide which program every launch runs.
 */
function findWindowsTerminalFromShortcuts(): Promise<string | null> {
	// String.raw keeps the backslashes exactly as PowerShell should see them.
	const script = String.raw`
$dirs = @(
  "$env:APPDATA\Microsoft\Windows\Start Menu",
  "$env:ProgramData\Microsoft\Windows\Start Menu",
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
if (-not $dirs) { exit }
$shell = New-Object -ComObject WScript.Shell
Get-ChildItem -LiteralPath $dirs -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
  $t = $shell.CreateShortcut($_.FullName).TargetPath
  if ($t -match '\\(WindowsTerminal|wt)\.exe$' -and (Test-Path -LiteralPath $t)) { $t; exit }
}`;
	return new Promise((resolve) => {
		const child = execFile(
			"powershell.exe",
			// Encoded, so the script's quotes never meet Windows command-line parsing.
			["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
			{ timeout: 20000, windowsHide: true },
			(err, stdout) => {
				const found = stdout?.toString().trim().split(/\r?\n/)[0];
				resolve(!err && found ? preferWtExe(found) : null);
			},
		);
		// PowerShell won't exit while its stdin is still open.
		child.stdin?.end();
	});
}

let detectedWindowsTerminal: Promise<string | null> | null = null;

/**
 * Finds Windows Terminal: the path from settings if one is set, else the usual install
 * locations, else a shortcut pointing at it. Auto-detection runs once per Obsidian session.
 */
export function findWindowsTerminal(configuredPath: string): Promise<string | null> {
	if (process.platform !== "win32") return Promise.resolve(null);
	const configured = configuredPath.trim().replace(/^"|"$/g, "");
	if (configured) return Promise.resolve(exists(configured) ? preferWtExe(configured) : null);
	detectedWindowsTerminal ??= Promise.resolve(findWindowsTerminalOnPath()).then((p) => p ?? findWindowsTerminalFromShortcuts());
	return detectedWindowsTerminal;
}

/** `wx`: fail rather than write through anything already at this (random) path. */
async function writeNewFile(file: string, content: string) {
	await fs.promises.writeFile(file, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

/**
 * Opens a new terminal window (or Windows Terminal tab) running claude. The launch script is written to a temp
 * file (which deletes itself) so prompts never pass through cmd/PowerShell/wsl quoting.
 */
export async function launchInTerminal(
	spec: LaunchSpec,
	title: string,
	settings: LodestoneSettings,
): Promise<{ terminal: TerminalApp; fallbackReason?: string }> {
	if (process.platform !== "win32") throw new Error(WINDOWS_ONLY);

	const base = path.join(os.tmpdir(), `lodestone-${crypto.randomBytes(6).toString("hex")}`);
	const file = base + (spec.env === "powershell" ? ".ps1" : ".sh");
	let target: LaunchTarget;

	if (spec.env === "powershell") {
		const exe = resolvePowershellExe(settings.powershellExe);
		const body = buildPowershellScript(spec, {
			claudeCmd: settings.claudeCommandPowershell,
			selfPath: file,
		});
		// BOM so Windows PowerShell 5.1 reads the file as UTF-8.
		await writeNewFile(file, "\ufeff" + body);
		target = { env: "powershell", exe, scriptPath: file };
	} else {
		const wslFile = windowsToWsl(file, settings.wslMountRoot);
		await writeNewFile(file, buildBashScript(spec, { claudeCmd: settings.claudeCommandWsl, selfPath: wslFile }));
		target = { env: "wsl", distro: settings.wslDistro.trim() || undefined, scriptPath: wslFile };
	}

	const wtExe = settings.terminalApp === "windows-terminal" ? await findWindowsTerminal(settings.windowsTerminalPath) : null;

	try {
		const launch = buildLaunchCommand({
			target,
			title,
			terminal: wtExe ? "windows-terminal" : "console",
			wtExe: wtExe ?? undefined,
			wtNewWindow: settings.wtNewWindow,
		});
		await runCmd(launch.commandLine, launch.vars);
		return { terminal: launch.terminal, fallbackReason: launch.fallbackReason };
	} catch (e) {
		// The script only deletes itself if it ran.
		await fs.promises.rm(file, { force: true }).catch(() => {});
		throw e;
	}
}

function runCmd(commandLine: string, vars: Record<string, string>): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		// /v:off: even if the registry turns on delayed expansion, !VAR! in a value stays text.
		const child = spawn("cmd.exe", ["/d", "/v:off", "/s", "/c", `"${commandLine}"`], {
			env: { ...process.env, ...vars },
			windowsVerbatimArguments: true,
			windowsHide: true,
			stdio: "ignore",
		});
		child.on("error", reject);
		child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`cmd exited with code ${code}`))));
	});
}

/** Asks WSL where its ~/.claude/projects lives, as a Windows UNC path. */
export function detectWslProjectsDir(settings: LodestoneSettings): Promise<string | null> {
	if (process.platform !== "win32") return Promise.resolve(null);
	const args: string[] = [];
	if (settings.wslDistro.trim()) args.push("-d", settings.wslDistro.trim());
	args.push("--exec", "sh", "-c", 'wslpath -w "$HOME/.claude/projects"');
	return new Promise((resolve) => {
		execFile("wsl.exe", args, { timeout: 15000, windowsHide: true }, (err, stdout) => {
			const out = stdout?.toString().trim();
			resolve(err || !out ? null : out);
		});
	});
}
