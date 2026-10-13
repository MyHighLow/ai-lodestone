import { after, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SessionStore } from "../src/sessions.ts";
import { DEFAULT_SETTINGS, type LodestoneSettings } from "../src/types.ts";

const ID = "11111111-2222-3333-4444-555555555555";

const temps: string[] = [];
after(() => temps.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function tempStore(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lodestone-sessions-"));
	temps.push(dir);
	return dir;
}

function writeSession(dir: string, project: string, mtimeSec: number): string {
	fs.mkdirSync(path.join(dir, project), { recursive: true });
	const file = path.join(dir, project, ID + ".jsonl");
	fs.writeFileSync(file, "");
	fs.utimesSync(file, mtimeSec, mtimeSec);
	return file;
}

function store(settings: Partial<LodestoneSettings>): SessionStore {
	return new SessionStore(() => ({ ...DEFAULT_SETTINGS, ...settings }));
}

test("sessions: the newer transcript wins when both stores have the session", async () => {
	const win = tempStore();
	const wsl = tempStore();
	writeSession(win, "C--Vault", 1_000);
	const newer = writeSession(wsl, "-mnt-c-Vault", 2_000);
	const found = await store({ windowsProjectsDir: win, wslProjectsDir: wsl }).lookup(ID);
	assert.equal(found?.env, "wsl");
	assert.equal(found?.file, newer);
});

// Off Windows no WSL store is detected, so only the Windows store is searched.
test("sessions: a store with no folder is skipped", { skip: process.platform === "win32" ? "WSL detection runs on Windows" : false }, async () => {
	const win = tempStore();
	const file = writeSession(win, "C--Vault", 1_000);
	const s = store({ windowsProjectsDir: win, wslProjectsDir: "" });
	assert.equal(await s.wslProjectsDir(), null);
	const found = await s.lookup(ID);
	assert.equal(found?.env, "powershell");
	assert.equal(found?.file, file);
});

test("sessions: an unknown session id finds nothing", async () => {
	const s = store({ windowsProjectsDir: tempStore(), wslProjectsDir: path.join(tempStore(), "missing") });
	assert.equal(await s.lookup(ID), null);
});
