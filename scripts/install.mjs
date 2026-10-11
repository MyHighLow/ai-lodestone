// Copies the built plugin into <vault>/.obsidian/plugins/<id>/, where <id> is manifest.json's `id`.
// Usage: node scripts/install.mjs ["D:\\Vaults\\MyVault" | /mnt/d/Vaults/MyVault]
// The vault is remembered in .vault, so later runs need no argument.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savedVaultFile = path.join(root, ".vault");
const FILES = ["main.js", "manifest.json", "styles.css"];
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
export const logPrefix = `[${manifest.id}]`;

/** Accepts a Windows path (when running under WSL) or a native path. */
export function normalizeVaultPath(p) {
	const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
	if (m && process.platform !== "win32") {
		return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
	}
	return p;
}

/**
 * The plugin's folder in a vault. Obsidian expects it to be named after the manifest `id`,
 * which must be lowercase letters, digits and dashes, so it can't point outside `plugins/`.
 */
export function pluginDir(vaultPath, manifest) {
	const id = manifest?.id;
	if (typeof id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
		throw new Error(`manifest.json has no valid "id" (got ${JSON.stringify(id)})`);
	}
	return path.join(vaultPath, ".obsidian", "plugins", id);
}

export function readSavedVault() {
	try {
		return fs.readFileSync(savedVaultFile, "utf8").trim() || null;
	} catch {
		return null;
	}
}

/**
 * `hotReload`: also create an empty `.hotreload` file, the marker the Hot Reload plugin
 * needs before it reloads a plugin folder that isn't a git checkout.
 */
export function copyToVault(vault, { hotReload = false } = {}) {
	const vaultPath = normalizeVaultPath(vault);
	if (!fs.existsSync(path.join(vaultPath, ".obsidian"))) {
		throw new Error(`${vaultPath} doesn't look like a vault (no .obsidian folder)`);
	}
	const dest = pluginDir(vaultPath, manifest);
	fs.mkdirSync(dest, { recursive: true });
	for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(dest, f));
	if (hotReload) fs.closeSync(fs.openSync(path.join(dest, ".hotreload"), "a"));
	console.log(`${logPrefix} installed to ${dest}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const vault = process.argv[2] ?? readSavedVault();
	if (!vault) {
		console.error('Usage: npm run install-plugin -- "D:\\Vaults\\YourVault"');
		process.exit(1);
	}
	try {
		copyToVault(vault);
		fs.writeFileSync(savedVaultFile, vault + "\n");
	} catch (e) {
		console.error(`${logPrefix} ${e.message}`);
		process.exit(1);
	}
}
