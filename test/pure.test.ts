import { test } from "node:test";
import assert from "node:assert/strict";
import {
	appendRunToBlock,
	parsePromptBody,
	parseSessionBody,
	titleFromFence,
} from "../src/parse.ts";
import {
	buildBashScript,
	buildCopyCommand,
	buildStartCommand,
	buildPowershellScript,
	escapeForLegacyNative,
	newSessionArgs,
	psQuote,
	shQuote,
	windowsToWsl,
} from "../src/scripts.ts";
import { summarizeTranscript } from "../src/transcript.ts";
import { wslToWindows } from "../src/util.ts";

const ID = "3f8a2c1e-9b47-4d6a-a5e2-7c0d1b9e4f36";

test("session block: /status paste", () => {
	const b = parseSessionBody(`Session name:      Refactor the parser\nSession ID:        ${ID}\n`);
	assert.equal(b.sessionId, ID);
	assert.equal(b.name, "Refactor the parser");
});

test("session block: bare and uppercase UUID", () => {
	assert.equal(parseSessionBody(ID.toUpperCase()).sessionId, ID);
	assert.equal(parseSessionBody("nothing here").sessionId, null);
});

test("session block: full /status with other lines", () => {
	const b = parseSessionBody(` Version: 2.1.269\n Session name: x\n Session ID: ${ID}\n cwd: /home/user\n Model: opus`);
	assert.equal(b.sessionId, ID);
	assert.equal(b.fields.cwd, "/home/user");
});

test("fence title", () => {
	assert.equal(titleFromFence("```claude-session My Custom Override Title", "claude-session"), "My Custom Override Title");
	assert.equal(titleFromFence("```claude-session", "claude-session"), null);
	assert.equal(titleFromFence("~~~~claude-prompt  Hi ", "claude-prompt"), "Hi");
	assert.equal(titleFromFence("```python x", "claude-prompt"), null);
});

test("prompt block: history split keeps prompt's own ---", () => {
	const src = `Intro\n---\nmore prompt\n---\n2026-10-10 15:42 | wsl | ${ID}\n2026-10-11 09:00 | powershell | ${ID}\n`;
	const p = parsePromptBody(src);
	assert.equal(p.prompt, "Intro\n---\nmore prompt");
	assert.equal(p.runs.length, 2);
	assert.equal(p.runs[1].env, "powershell");
	assert.deepEqual(parsePromptBody("a\n---\nb").runs, []);
	assert.equal(parsePromptBody("a\n---\nb").prompt, "a\n---\nb");
});

test("appendRunToBlock adds separator once", () => {
	const lines = ["# Note", "```claude-prompt T", "do it", "", "```", "after"];
	const run = { time: "2026-10-10 15:42", env: "wsl" as const, sessionId: ID };
	const once = appendRunToBlock(lines, 1, 4, run);
	assert.deepEqual(once, ["# Note", "```claude-prompt T", "do it", "---", `2026-10-10 15:42 | wsl | ${ID}`, "```", "after"]);
	const twice = appendRunToBlock(once, 1, 5, run);
	assert.equal(twice.filter((l) => l === "---").length, 1);
	assert.equal(parsePromptBody(twice.slice(2, 6).join("\n")).runs.length, 2);
});

test("path conversion", () => {
	assert.equal(windowsToWsl("D:\\Vaults\\MyVault\\Notes"), "/mnt/d/Vaults/MyVault/Notes");
	assert.equal(windowsToWsl("C:\\"), "/mnt/c");
	assert.equal(windowsToWsl("\\\\wsl.localhost\\Ubuntu\\home\\user"), "/home/user");
	assert.equal(wslToWindows("/mnt/d/Vaults/MyVault"), "D:\\Vaults\\MyVault");
	assert.equal(wslToWindows("/home/user"), null);
});

const nasty = `Say "hi" & it's $HOME \`whoami\` 'quoted' ’curly’\nline two; rm -rf /`;

test("bash quoting round-trips", async () => {
	const { execFileSync } = await import("node:child_process");
	const out = execFileSync("bash", ["-c", `printf %s ${shQuote(nasty)}`]).toString();
	assert.equal(out, nasty);
	const script = buildBashScript({ env: "wsl", cwd: "/tmp", args: newSessionArgs({ sessionId: ID, prompt: nasty, name: "it's" }) }, { claudeCmd: "printf '%s\\n'" });
	const lines = execFileSync("bash", ["-c", script.replace("exec bash -l", "")]).toString();
	assert.equal(lines, ["--session-id", ID, "--name", "it's", nasty].join("\n") + "\n");
});

test("powershell quoting", () => {
	assert.equal(psQuote("it's ’x’"), "'it''s ’’x’’'");
	const script = buildPowershellScript(
		{ env: "powershell", cwd: "D:\\Vault\\Notes", args: newSessionArgs({ sessionId: ID, prompt: 'a "b"' }) },
		{ claudeCmd: "claude", selfPath: "C:\\Temp\\x.ps1" },
	);
	assert.match(script, /Set-Location -LiteralPath 'D:\\Vault\\Notes'/);
	assert.match(script, new RegExp(`& 'claude' '--session-id' '${ID}' 'a "b"'`));
	assert.equal(escapeForLegacyNative('a "b" c\\'), 'a \\"b\\" c\\\\');
});

test("prompt starting with dash is protected", () => {
	assert.deepEqual(newSessionArgs({ prompt: "-x" }), ["--", "-x"]);
});

test("copy commands", () => {
	assert.equal(
		buildCopyCommand({ env: "powershell", cwd: "D:\\V", args: ["--resume", ID] }, "claude"),
		`cd 'D:\\V'; & 'claude' '--resume' '${ID}'`,
	);
	assert.equal(buildCopyCommand({ env: "wsl", cwd: "/mnt/d/V", args: ["--resume", ID] }, "claude"), `cd '/mnt/d/V' && claude '--resume' '${ID}'`);
});

test("transcript summary", () => {
	const lines = [
		{ type: "mode", sessionId: ID },
		{ type: "user", message: { role: "user", content: "<command-name>/status</command-name>" }, cwd: "/home/user/x", timestamp: "2026-10-10T10:00:00Z", gitBranch: "main" },
		{ type: "user", message: { role: "user", content: "first real prompt" }, cwd: "/home/user/x", timestamp: "2026-10-10T10:01:00Z" },
		{ type: "assistant", message: { content: [] }, timestamp: "2026-10-10T10:02:00Z" },
		{ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "x" }] }, timestamp: "2026-10-10T10:03:00Z" },
		{ type: "user", message: { role: "user", content: [{ type: "text", text: "second" }] }, timestamp: "2026-10-10T10:04:00Z" },
		{ type: "ai-title", aiTitle: "Auto title" },
		{ type: "agent-name", agentName: "My name" },
	];
	const s = summarizeTranscript(lines.map((l) => JSON.stringify(l)).join("\n") + "\n{partial");
	assert.equal(s.cwd, "/home/user/x");
	assert.equal(s.promptCount, 2);
	assert.equal(s.firstPrompt, "first real prompt");
	assert.equal(s.lastPrompt, "second");
	assert.equal(s.title, "My name");
	assert.equal(s.gitBranch, "main");
	assert.equal(s.lastTime, "2026-10-10T10:04:00Z");
});

test("start command: console window (unchanged from before)", () => {
	const program = `"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo -NoExit -File "C:\\T\\x.ps1"`;
	assert.equal(buildStartCommand({ title: 'My "note" 100%', program, terminal: "console" }), `start "My note 100" ${program}`);
});

test("start command: Windows Terminal tab / window", () => {
	const program = `wsl.exe -d "Ubuntu" --cd ~ --exec bash -lic "source '/mnt/c/T/x.sh'"`;
	const wt = "C:\\Users\\User\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe";
	assert.equal(
		buildStartCommand({ title: "a; b", program, terminal: "windows-terminal", wtExe: wt }),
		`start "" "${wt}" -w 0 new-tab --title "a b" ${program}`,
	);
	assert.match(buildStartCommand({ title: "t", program: "x;y", terminal: "windows-terminal", wtExe: wt, wtNewWindow: true }), /-w new new-tab --title "t" x\\;y$/);
	// No wt.exe found → falls back to a console window.
	assert.equal(buildStartCommand({ title: "t", program: "p", terminal: "windows-terminal" }), `start "t" p`);
});
