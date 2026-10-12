---
title: Security hardening decisions
tags: [security, decisions, audit]
updated: 2026-10-11
---

# Security hardening decisions

Lodestone turns text from notes into commands that run on the user's machine, so it treats every note as untrusted. Three audit rounds hardened it; all the fixes listed here have shipped. Details live in the topic entries.

## Threat model in one line

A note (written by someone else, synced, or pasted in) must not be able to run commands, change which program runs, or make the prompt that's sent differ from the prompt that's shown.

## Decisions

| Decision | Entry |
| --- | --- |
| Prompts go through a self-deleting temp script, never a command line. | [launch-pipeline.md](launch-pipeline.md) |
| The `cmd.exe` line holds only fixed text and `%LODESTONE_*%` references; values with `"` are rejected; `/v:off`. | [launch-pipeline.md](launch-pipeline.md) |
| Fall back to a console window when a path contains `%`, because Windows Terminal re-expands it. | [launch-pipeline.md](launch-pipeline.md) |
| Windows Terminal detection ignores Desktop and download-folder shortcuts. | [launch-pipeline.md](launch-pipeline.md) |
| `--` always precedes the prompt; `--name=<value>` is one token. | [launch-pipeline.md](launch-pipeline.md) |
| Resolve claude once with an allowlist and refuse `.cmd`/`.bat`; the Copy command uses the same lookup. | [powershell-claude.md](powershell-claude.md) |
| Refuse to start rather than send a different prompt when old PowerShell can't pass it intact. | [powershell-claude.md](powershell-claude.md) |
| Strip invisible, text-direction and control characters after placeholder expansion and again for every launch. | [invisible-characters.md](invisible-characters.md) |
| Long prompts must be expanded and seen before Run or Copy act. | [invisible-characters.md](invisible-characters.md) |
| Release CI: npm runs only in read-only jobs, stable releases need an approval, and no secrets are stored. | [release-pipeline.md](release-pipeline.md) |

Smaller fixes, all in `src/parse.ts` and `src/main.ts`:

- Session-block parsing uses `indexOf` and `trim` instead of a regex. The old regex had overlapping `\s*` groups, so a long line of spaces took cubic time and froze Obsidian on render.
- Placeholder expansion uses a replacer function, so `$&` or `$1` in a file name is inserted literally.
- Run-history lines only accept strict UUIDs.
- Titles in inserted session blocks have backticks and newlines removed, so they can't end the fence.

## When changing launch code

Add a test in `test/pure.test.ts` for any new quoting or escaping path, with a hostile value (quotes, `%`, `&`, `;`, apostrophes, trailing backslashes, invisible characters). Prefer refusing with a clear message over guessing.
