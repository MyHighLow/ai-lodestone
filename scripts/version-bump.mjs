// Runs as the npm `version` script: `npm version patch|minor|major` has already updated
// package.json and package-lock.json. This copies the new version into manifest.json and
// records it in versions.json (plugin version -> minimum Obsidian version).
// .npmrc sets git-tag-version=false, so npm makes no commit or tag. CI creates the tags.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.env.npm_package_version;
if (!version) {
	console.error("[ai-lodestone] run this through `npm version`, not directly");
	process.exit(1);
}

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const writeJson = (f, data) => fs.writeFileSync(path.join(root, f), JSON.stringify(data, null, 2) + "\n");

const manifest = readJson("manifest.json");
manifest.version = version;
writeJson("manifest.json", manifest);

const versions = readJson("versions.json");
versions[version] = manifest.minAppVersion;
writeJson("versions.json", versions);

console.log(`[ai-lodestone] manifest.json and versions.json set to ${version}`);
