import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	agreedVersion,
	compareVersions,
	latestVersionTag,
	nextTag,
	parseVersion,
	versionFieldsChanged,
} from "../scripts/check-version.mjs";

test("version: parses plain X.Y.Z only", () => {
	assert.deepEqual(parseVersion("0.1.0"), [0, 1, 0]);
	assert.deepEqual(parseVersion("10.20.300"), [10, 20, 300]);
	for (const bad of ["v0.1.0", "0.1", "0.1.0.1", "01.1.0", "0.1.0-beta.1", "0.1.0+build", " 0.1.0", "0.1.0\n1.0.0", ""]) {
		assert.equal(parseVersion(bad), null, bad);
	}
});

test("version: compares numerically, not as text", () => {
	assert.equal(compareVersions("0.1.10", "0.1.9"), 1);
	assert.equal(compareVersions("0.2.0", "0.10.0"), -1);
	assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
	assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
	assert.throws(() => compareVersions("v1.2.3", "1.2.3"));
});

test("version: latest tag ignores non-version tags", () => {
	assert.equal(latestVersionTag([]), null);
	assert.equal(latestVersionTag(["v9.9.9", "latest", "1.0.0-rc.1"]), null);
	assert.equal(latestVersionTag(["0.1.9", "0.1.10", "v2.0.0", "0.1.2"]), "0.1.10");
});

const files = (v: string, overrides: Record<string, unknown> = {}) => ({
	pkg: { version: v },
	lock: { version: v, packages: { "": { version: v } } },
	manifest: { version: v, minAppVersion: "1.5.0" },
	versions: { "0.1.0": "1.5.0", [v]: "1.5.0" },
	...overrides,
});

test("version: files must agree", () => {
	assert.equal(agreedVersion(files("0.2.0")), "0.2.0");
	assert.throws(() => agreedVersion(files("0.2.0", { pkg: { version: "0.1.0" } })), /disagree/);
	assert.throws(
		() => agreedVersion(files("0.2.0", { lock: { version: "0.2.0", packages: { "": { version: "0.1.0" } } } })),
		/disagree/,
	);
	assert.throws(() => agreedVersion(files("0.2.0", { manifest: { version: "0.1.0" } })), /disagree/);
});

test("version: must be plain X.Y.Z and listed in versions.json", () => {
	assert.throws(() => agreedVersion(files("0.2.0-beta.1")), /plain/);
	assert.throws(() => agreedVersion(files("0.2.0", { versions: { "0.1.0": "1.5.0" } })), /versions\.json/);
	// An inherited key doesn't count as an entry.
	assert.throws(() => agreedVersion(files("constructor")), /plain/);
});

test("version: next tag is one patch above the highest tag or the manifest version", () => {
	// First run, no tags yet.
	assert.equal(nextTag([], "0.1.0"), "0.1.1");
	assert.equal(nextTag(["not-a-version", "v9.9.9"], "0.1.0"), "0.1.1");
	assert.equal(nextTag(["0.1.1", "0.1.2"], "0.1.0"), "0.1.3");
	assert.equal(nextTag(["0.1.9", "0.1.10"], "0.1.0"), "0.1.11");
	// A stable release set the manifest above every tag: don't re-use it.
	assert.equal(nextTag(["0.1.7"], "0.2.0"), "0.2.1");
	// A stable version that is also a tag.
	assert.equal(nextTag(["0.1.7", "0.2.0"], "0.2.0"), "0.2.1");
});

test("version: PR check flags only version fields", () => {
	const base = files("0.1.0");
	assert.deepEqual(versionFieldsChanged(base, files("0.1.0")), []);
	// A rename or a new minAppVersion is fine.
	assert.deepEqual(
		versionFieldsChanged(base, files("0.1.0", { manifest: { id: "x", name: "X", version: "0.1.0", minAppVersion: "1.6.0" } })),
		[],
	);
	assert.deepEqual(versionFieldsChanged(base, files("0.1.0", { pkg: { version: "0.1.0", scripts: { x: "y" } } })), []);
	assert.deepEqual(versionFieldsChanged(base, files("0.2.0")), [
		"package.json version",
		"package-lock.json version",
		'package-lock.json packages[""] version',
		"manifest.json version",
		"versions.json",
	]);
	assert.deepEqual(versionFieldsChanged(base, files("0.1.0", { manifest: { version: "0.1.1" } })), ["manifest.json version"]);
	assert.deepEqual(
		versionFieldsChanged(base, files("0.1.0", { lock: { version: "0.1.0", packages: { "": { version: "0.1.1" } } } })),
		['package-lock.json packages[""] version'],
	);
	assert.deepEqual(versionFieldsChanged(base, files("0.1.0", { versions: { "0.1.0": "1.6.0" } })), ["versions.json"]);
	assert.deepEqual(versionFieldsChanged(base, files("0.1.0", { versions: {} })), ["versions.json"]);
	// versions.json missing from the base (the PR that adds it) isn't compared.
	assert.deepEqual(versionFieldsChanged({ ...base, versions: null }, files("0.1.0")), []);
	// But removing it is a change.
	assert.deepEqual(versionFieldsChanged(base, { ...files("0.1.0"), versions: null }), ["versions.json"]);
});

// The CLI, run in a throwaway git repo with a copy of the script.
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-version.mjs");
const gitEnv = {
	...process.env,
	GIT_CONFIG_GLOBAL: os.devNull,
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_AUTHOR_NAME: "test",
	GIT_AUTHOR_EMAIL: "test@users.noreply.github.com",
	GIT_COMMITTER_NAME: "test",
	GIT_COMMITTER_EMAIL: "test@users.noreply.github.com",
};

function repo(t: { after: (fn: () => void) => void }) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lodestone-version-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	fs.mkdirSync(path.join(dir, "scripts"));
	fs.copyFileSync(script, path.join(dir, "scripts", "check-version.mjs"));
	const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, env: gitEnv, encoding: "utf8" }).trim();
	const write = (v: string, { versions = true, name = "Lodestone" } = {}) => {
		const json = (f: string, data: unknown) => fs.writeFileSync(path.join(dir, f), JSON.stringify(data, null, 2) + "\n");
		json("package.json", { name: "lodestone", version: v });
		json("package-lock.json", { name: "lodestone", version: v, packages: { "": { name: "lodestone", version: v } } });
		json("manifest.json", { id: "lodestone", name, version: v, minAppVersion: "1.5.0" });
		if (versions) json("versions.json", { "0.1.0": "1.5.0", [v]: "1.5.0" });
	};
	const commit = (msg: string) => {
		git("add", "-A");
		git("commit", "-q", "--allow-empty", "-m", msg);
		return git("rev-parse", "HEAD");
	};
	const run = (...args: string[]) => {
		const r = spawnSync("node", ["scripts/check-version.mjs", ...args], { cwd: dir, env: gitEnv, encoding: "utf8" });
		return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
	};
	git("init", "-q", "-b", "main");
	return { git, write, commit, run };
}

test("version CLI: next", (t) => {
	const r = repo(t);
	r.write("0.1.0");
	const first = r.commit("first");
	assert.deepEqual(r.run("next"), { code: 0, out: "0.1.1", err: "" });
	r.git("tag", "-a", "0.1.1", "-m", "Lodestone 0.1.1");
	// A re-run on the tagged commit gives its tag.
	assert.equal(r.run("next").out, "0.1.1");
	r.commit("second");
	assert.equal(r.run("next").out, "0.1.2");
	// Several tags on HEAD (a stable version cut on a tagged commit): the highest.
	r.git("tag", "0.1.2");
	r.git("tag", "0.2.0");
	r.git("tag", "not-a-version");
	assert.equal(r.run("next").out, "0.2.0");
	r.commit("third");
	assert.equal(r.run("next").out, "0.2.1");
	// An older commit can't be tagged above a newer one.
	r.git("checkout", "-q", "--detach", first);
	r.git("tag", "-d", "0.1.1");
	const older = r.run("next");
	assert.equal(older.code, 1);
	assert.match(older.err, /isn't an ancestor of HEAD/);
});

test("version CLI: pr", (t) => {
	const r = repo(t);
	r.write("0.1.0", { versions: false });
	const bootstrap = r.commit("before versions.json");
	r.write("0.1.0");
	r.commit("add versions.json");
	// Adding versions.json isn't a version change.
	assert.deepEqual(r.run("pr", bootstrap), { code: 0, out: "version unchanged", err: "" });
	const base = r.git("rev-parse", "HEAD");
	r.write("0.1.0", { name: "Lodestar" });
	r.commit("rename");
	assert.equal(r.run("pr", base).code, 0);
	r.write("0.2.0", { name: "Lodestar" });
	r.commit("bump");
	const bumped = r.run("pr", base);
	assert.equal(bumped.code, 1);
	assert.match(bumped.err, /manifest\.json version/);
	// A commit that isn't in the clone fails instead of comparing nothing.
	const missing = r.run("pr", "f".repeat(40));
	assert.equal(missing.code, 1);
	assert.match(missing.err, /isn't in this clone/);
	assert.match(r.run("pr", "HEAD").err, /full SHA/);
	assert.match(r.run().err, /usage/);
});
