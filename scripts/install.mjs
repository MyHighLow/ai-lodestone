// Copies the built plugin into <vault>/.obsidian/plugins/lodestone/.
// Usage: node scripts/install.mjs ["D:\\Vaults\\MyVault" | /mnt/d/Vaults/MyVault]
// The vault is remembered in .vault, so later runs need no argument.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savedVaultFile = path.join(root, ".vault");
const FILES = ["main.js", "manifest.json", "styles.css"];

/** Accepts a Windows path (when running under WSL) or a native path. */
export function normalizeVaultPath(p) {
	const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
	if (m && process.platform !== "win32") {
		return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
	}
	return p;
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
	const dest = path.join(vaultPath, ".obsidian", "plugins", "lodestone");
	fs.mkdirSync(dest, { recursive: true });
	for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(dest, f));
	if (hotReload) fs.closeSync(fs.openSync(path.join(dest, ".hotreload"), "a"));
	console.log(`[lodestone] installed to ${dest}`);
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
		console.error(`[lodestone] ${e.message}`);
		process.exit(1);
	}
}
