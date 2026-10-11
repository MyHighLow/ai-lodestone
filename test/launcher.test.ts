import { test } from "node:test";
import assert from "node:assert/strict";
import { detectWslProjectsDir, findWindowsTerminal, launchInTerminal, WINDOWS_ONLY } from "../src/launcher.ts";
import type { LaunchSpec } from "../src/scripts.ts";
import { DEFAULT_SETTINGS } from "../src/types.ts";

// The community store can't filter by OS, so macOS and Linux users can install the plugin.
// Off Windows it must fail with a clear message and never spawn or wait on Windows programs.
const offWindows = { skip: process.platform === "win32" ? "covers the non-Windows paths" : false };

test("launcher: launching off Windows fails with the Windows-only message", offWindows, async () => {
	const spec = { env: "powershell", cwd: "C:\\V", args: [] } as unknown as LaunchSpec;
	await assert.rejects(launchInTerminal(spec, "title", DEFAULT_SETTINGS), { message: WINDOWS_ONLY });
});

test("launcher: no Windows Terminal or WSL detection off Windows", offWindows, async () => {
	assert.equal(await findWindowsTerminal(""), null);
	assert.equal(await findWindowsTerminal("C:\\wt.exe"), null);
	assert.equal(await detectWslProjectsDir(DEFAULT_SETTINGS), null);
});

test("launcher: the Windows-only message names the plugin", () => {
	assert.match(WINDOWS_ONLY, /^AI Lodestone .*Windows only\.$/);
});
