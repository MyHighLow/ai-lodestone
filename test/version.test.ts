import { test } from "node:test";
import assert from "node:assert/strict";
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
});
