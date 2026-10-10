import { execFile, spawn } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildBashScript, buildPowershellScript, consoleTitle, windowsToWsl, type LaunchSpec } from "./scripts";
import type { LodestoneSettings } from "./types";

const PWSH7 = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";

export function resolvePowershellExe(setting: string): string {
	if (setting && setting !== "auto") return setting;
	return fs.existsSync(PWSH7) ? PWSH7 : "powershell.exe";
}

function isLegacyPowershell(exe: string): boolean {
	return /(^|[\\/])powershell(\.exe)?$/i.test(exe);
}

function wslDistroArgs(settings: LodestoneSettings): string {
	const d = settings.wslDistro.trim();
	return d ? `-d "${d.replace(/"/g, "")}" ` : "";
}

/**
 * Opens a new console window running claude. The launch script is written to a temp
 * file (which deletes itself) so prompts never pass through cmd/PowerShell/wsl quoting.
 */
export async function launchInTerminal(spec: LaunchSpec, title: string, settings: LodestoneSettings): Promise<void> {
	if (process.platform !== "win32") throw new Error("Lodestone currently launches terminals on Windows only.");

	const base = path.join(os.tmpdir(), `lodestone-${crypto.randomBytes(6).toString("hex")}`);
	const winTitle = consoleTitle(title);
	let commandLine: string;

	if (spec.env === "powershell") {
		const exe = resolvePowershellExe(settings.powershellExe);
		const file = base + ".ps1";
		const body = buildPowershellScript(spec, {
			claudeCmd: settings.claudeCommandPowershell,
			selfPath: file,
			legacyPowershell: isLegacyPowershell(exe),
		});
		// BOM so Windows PowerShell 5.1 reads the file as UTF-8.
		await fs.promises.writeFile(file, "\ufeff" + body, "utf8");
		commandLine = `start "${winTitle}" "${exe}" -NoLogo -NoExit -ExecutionPolicy Bypass -File "${file}"`;
	} else {
		const file = base + ".sh";
		const wslFile = windowsToWsl(file, settings.wslMountRoot);
		const body = buildBashScript(spec, { claudeCmd: settings.claudeCommandWsl, selfPath: wslFile });
		await fs.promises.writeFile(file, body, "utf8");
		commandLine = `start "${winTitle}" wsl.exe ${wslDistroArgs(settings)}--cd ~ --exec bash -lic "source '${wslFile}'"`;
	}

	await new Promise<void>((resolve, reject) => {
		const child = spawn("cmd.exe", ["/d", "/s", "/c", `"${commandLine}"`], {
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
