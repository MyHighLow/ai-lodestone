import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logPrefix, normalizeVaultPath, pluginDir } from "../scripts/install.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("install: the plugin folder is named after the manifest id", () => {
	assert.equal(pluginDir("/vault", { id: "lodestone" }), path.join("/vault", ".obsidian", "plugins", "lodestone"));
	assert.equal(pluginDir("/vault", { id: "claude-sessions-2" }), path.join("/vault", ".obsidian", "plugins", "claude-sessions-2"));
	assert.equal(pluginDir("/vault", manifest), path.join("/vault", ".obsidian", "plugins", manifest.id));
});

test("install: rejects a missing or unsafe manifest id", () => {
	for (const id of [undefined, null, "", 42, "..", "../x", "a/b", "a\\b", "Lodestone", "lode stone", "-x", "x-", "a--b"]) {
		assert.throws(() => pluginDir("/vault", { id }), /no valid "id"/, String(id));
	}
	assert.throws(() => pluginDir("/vault", undefined), /no valid "id"/);
});

test("install: log prefix comes from the manifest id", () => {
	assert.equal(logPrefix, `[${manifest.id}]`);
});

test("install: Windows vault paths become /mnt paths outside Windows", { skip: process.platform === "win32" }, () => {
	assert.equal(normalizeVaultPath("D:\\Vaults\\My Vault"), "/mnt/d/Vaults/My Vault");
	assert.equal(normalizeVaultPath("c:/Users/x/Vault"), "/mnt/c/Users/x/Vault");
});

test("install: other vault paths are left as they are", () => {
	for (const p of ["/mnt/d/Vaults/MyVault", "relative/vault", "\\\\wsl.localhost\\distro\\vault"]) {
		assert.equal(normalizeVaultPath(p), p);
	}
});
