// Checks the knowledge base (docs/kb/) and its skill: every entry is indexed, and nothing
// that looks like a secret or personal data has slipped in. The repository is public.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kbDir = path.join(root, "docs", "kb");
const skillDir = path.join(root, ".claude", "skills", "knowledge-base");

function filesIn(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
		const p = path.join(dir, d.name);
		return d.isDirectory() ? filesIn(p) : [p];
	});
}

const SENSITIVE: [string, RegExp][] = [
	["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
	["API key (sk-…)", /\bsk-[A-Za-z0-9_-]{20,}/],
	["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
	["PEM block", /-----BEGIN [A-Z ]+-----/],
	["email address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/],
	["Windows user folder", /\b[A-Za-z]:[\\/]+Users[\\/]+(?!<)[^\\/\s`'"]+/i],
	["home folder", /\/(?:home|Users)\/(?!<)[^/\s`'"]+\//],
	["session ID", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
];

/** Labels of the sensitive patterns found in `text`. Email addresses are fine if they're noreply. */
function findSensitive(text: string): string[] {
	const found: string[] = [];
	for (const [label, re] of SENSITIVE) {
		const matches = text.match(new RegExp(re.source, re.flags + "g")) ?? [];
		const bad = label === "email address" ? matches.filter((m) => !/noreply/i.test(m)) : matches;
		if (bad.length) found.push(`${label}: ${bad.join(", ")}`);
	}
	return found;
}

test("kb: every entry is listed in INDEX.md, and every listed entry exists", () => {
	const index = fs.readFileSync(path.join(kbDir, "INDEX.md"), "utf8");
	const entries = filesIn(kbDir)
		.map((f) => path.relative(kbDir, f).split(path.sep).join("/"))
		.filter((f) => f !== "INDEX.md");
	assert.ok(entries.length > 0, "the knowledge base has no entries");
	for (const entry of entries) assert.ok(index.includes(`](${entry})`), `${entry} is not linked from INDEX.md`);
	for (const [, link] of index.matchAll(/\]\(([^)#]+\.md)\)/g)) {
		if (link.startsWith("../")) continue;
		assert.ok(fs.existsSync(path.join(kbDir, link)), `INDEX.md links to missing entry ${link}`);
	}
});

test("kb: every entry has a title, tags and updated header", () => {
	for (const file of filesIn(kbDir).filter((f) => f.endsWith(".md") && path.basename(f) !== "INDEX.md")) {
		const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, "utf8"))?.[1] ?? "";
		const name = path.relative(root, file);
		assert.match(head, /^title: \S/m, `${name} has no title`);
		assert.match(head, /^tags: \[.+\]$/m, `${name} has no tags`);
		assert.match(head, /^updated: \d{4}-\d{2}-\d{2}$/m, `${name} has no updated date`);
	}
});

test("kb: no secrets or personal data in the knowledge base or its skill", () => {
	for (const file of [...filesIn(kbDir), ...filesIn(skillDir)]) {
		const found = findSensitive(fs.readFileSync(file, "utf8"));
		assert.deepEqual(found, [], `${path.relative(root, file)} looks like it contains sensitive data`);
	}
});

test("kb: the sensitive-data check catches what it should", () => {
	// Built at run time so this file doesn't itself look like it holds a token.
	const samples = [
		"gh" + "p_" + "a1".repeat(18),
		"github_" + "pat_" + "a1".repeat(20),
		"s" + "k-ant-" + "a1".repeat(12),
		"-----BEGIN " + "OPENSSH PRIVATE KEY-----",
		"someone" + "@example.com",
		"C:\\" + "Users\\alice\\AppData",
		"/" + "home/alice/.claude",
		"3f8a2c1e-9b47-4d6a-a5e2-" + "7c0d1b9e4f36",
	];
	for (const s of samples) assert.notDeepEqual(findSensitive(s), [], `not caught: ${s}`);
	for (const ok of ["123+someone@users.noreply.github.com", "C:\\Users\\<name>", "/home/<name>/", "~/.claude/projects"]) {
		assert.deepEqual(findSensitive(ok), [], `false positive: ${ok}`);
	}
});
