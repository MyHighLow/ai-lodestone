// Version checks shared by the PR check and the release workflow. See "Versioning" in README.md.
// Both modes first check that the version files agree.
//   next           prints the highest plain X.Y.Z tag HEAD already has (a re-run), or else
//                  the tag the release workflow should create: one patch above the highest
//                  X.Y.Z tag or the manifest version, whichever is higher. Fails instead if
//                  that highest tag isn't an ancestor of HEAD: a newer commit is tagged.
//   pr <base-sha>  exits non-zero if committed HEAD changed a version field compared with
//                  the base commit. PRs never change the version; stable releases do (#3).
// Exits non-zero, printing why on stderr, on any failure.
// Usage: node scripts/check-version.mjs next | pr <base-sha>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = { pkg: "package.json", lock: "package-lock.json", manifest: "manifest.json", versions: "versions.json" };

/** Plain X.Y.Z (no `v`, no pre-release or build suffix) to [major, minor, patch], or null. */
export function parseVersion(s) {
	const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(s);
	return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a, b) {
	const pa = parseVersion(a);
	const pb = parseVersion(b);
	if (!pa || !pb) throw new Error(`not a plain X.Y.Z version: ${pa ? b : a}`);
	for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
	return 0;
}

/** Highest plain X.Y.Z tag, or null. Other tags are ignored. */
export function latestVersionTag(tags) {
	let latest = null;
	for (const t of tags) {
		if (parseVersion(t) && (latest === null || compareVersions(t, latest) > 0)) latest = t;
	}
	return latest;
}

/**
 * The version all the version files agree on. Throws if they disagree, if it isn't plain
 * X.Y.Z, or if versions.json has no entry for it.
 */
export function agreedVersion({ pkg, lock, manifest, versions }) {
	const found = {
		"package.json": pkg.version,
		"package-lock.json": lock.version,
		'package-lock.json packages[""]': lock.packages?.[""]?.version,
		"manifest.json": manifest.version,
	};
	const version = manifest.version;
	const differing = Object.entries(found).filter(([, v]) => v !== version);
	if (differing.length) {
		const list = Object.entries(found).map(([f, v]) => `${f}: ${v}`).join(", ");
		throw new Error(`version files disagree (${list}). Use npm version to change the version.`);
	}
	if (!parseVersion(version)) throw new Error(`version ${version} isn't a plain X.Y.Z version`);
	if (!Object.hasOwn(versions, version)) throw new Error(`versions.json has no entry for ${version}`);
	return version;
}

/**
 * The tag for the next merge to main: one patch above the highest X.Y.Z tag or the manifest
 * version, whichever is higher. With no tags yet, that's the manifest version plus one patch.
 * Taking the higher of the two means a stable version cut by a release is never re-used.
 */
export function nextTag(tags, manifestVersion) {
	const latest = latestVersionTag(tags);
	const base = latest !== null && compareVersions(latest, manifestVersion) > 0 ? latest : manifestVersion;
	const [major, minor, patch] = parseVersion(base);
	return `${major}.${minor}.${patch + 1}`;
}

/**
 * The version fields that differ between the base and head files: the `version` of
 * package.json, package-lock.json (top level and packages[""]) and manifest.json, and anything
 * in versions.json. Other edits, such as a manifest rename, are allowed. A file missing from
 * the base (versions.json before it was added) isn't compared.
 */
export function versionFieldsChanged(base, head) {
	const fields = [
		["package.json version", "pkg", (f) => f.version],
		["package-lock.json version", "lock", (f) => f.version],
		['package-lock.json packages[""] version', "lock", (f) => f.packages?.[""]?.version],
		["manifest.json version", "manifest", (f) => f.version],
		["versions.json", "versions", (f) => JSON.stringify(f)],
	];
	return fields
		.filter(([, file, get]) => base[file] != null && get(base[file]) !== get(head[file] ?? {}))
		.map(([name]) => name);
}

function git(...args) {
	return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function gitTags(...args) {
	return git("tag", "-l", ...args)
		.split("\n")
		.map((t) => t.trim())
		.filter(Boolean);
}

/**
 * The version files at `sha`. A file that isn't in that commit (versions.json before it was
 * added) is null. Throws if `sha` isn't a commit in this clone, rather than reading every file
 * as missing and comparing nothing.
 */
function filesAt(sha) {
	try {
		git("cat-file", "-e", `${sha}^{commit}`);
	} catch {
		throw new Error(`commit ${sha} isn't in this clone. Fetch it and try again.`);
	}
	const out = {};
	for (const [key, f] of Object.entries(FILES)) {
		const present = git("ls-tree", "--name-only", sha, "--", f).trim() !== "";
		out[key] = present ? JSON.parse(git("show", `${sha}:${f}`)) : null;
	}
	return out;
}

function next(version) {
	const own = latestVersionTag(gitTags("--points-at", "HEAD"));
	if (own !== null) return own;
	const tags = gitTags();
	const latest = latestVersionTag(tags);
	if (latest !== null) {
		// A re-run for an older merge would tag it above a newer one.
		try {
			git("merge-base", "--is-ancestor", `refs/tags/${latest}`, "HEAD");
		} catch {
			throw new Error(`the latest tag ${latest} isn't an ancestor of HEAD, so a newer commit is already tagged`);
		}
	}
	return nextTag(tags, version);
}

function pr(baseSha) {
	if (!/^[0-9a-f]{40}$/.test(baseSha ?? "")) throw new Error("pr needs the base commit's full SHA");
	const changed = versionFieldsChanged(filesAt(baseSha), filesAt("HEAD"));
	if (changed.length) {
		throw new Error(
			`this branch changes ${changed.join(", ")}. PRs must not change the version: ` +
				"every merge is tagged by CI, and stable releases set the version.",
		);
	}
	return "version unchanged";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
	const [mode, arg] = process.argv.slice(2);
	try {
		if (mode !== "next" && mode !== "pr") throw new Error("usage: node scripts/check-version.mjs next | pr <base-sha>");
		const version = agreedVersion(Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readJson(f)])));
		console.log(mode === "next" ? next(version) : pr(arg));
	} catch (e) {
		console.error(`[lodestone] ${e.message}`);
		process.exit(1);
	}
}
