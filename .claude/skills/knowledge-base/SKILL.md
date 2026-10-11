---
name: knowledge-base
description: Lodestone's project knowledge base in docs/kb/ (architecture, launch and quoting rules, PowerShell and WSL gotchas, session ownership, security decisions, dev workflow). Use it to answer questions about how Lodestone works, why something was done a certain way, past decisions, or known gotchas, before guessing from the code. Also use it to propose a knowledge-base addition or change, after asking, when a recurring problem has been resolved, a large architectural or steering decision has been made, something came up that will help long-term development of the project, or an entry turns out to be wrong or stale.
---

# Knowledge base

The knowledge base lives in `docs/kb/`. `docs/kb/INDEX.md` lists every entry with a one-line summary and tags. Each entry is one topic in its own Markdown file, with a header holding `title`, `tags` and `updated`.

## 1. Searching

1. Read `docs/kb/INDEX.md` first, and pick entries by summary and tags.
2. Search the folder for the key terms too, since an index summary can miss a detail: `grep -rin "<term>" docs/kb/`. Try synonyms (for example `wt`, `Windows Terminal`, `windows-terminal`).
3. Open the matching entries and answer from them. Cite the entry, for example `docs/kb/launch-pipeline.md`, and the section.
4. If nothing relevant is found, say that the knowledge base doesn't cover it, then answer from the code or README and say so. Don't present a guess as recorded knowledge.
5. If the code contradicts an entry, trust the code, tell the user, and offer to fix the entry (section 3).

## 2. What belongs, and what doesn't

**The repository is public. Everything in the knowledge base is public.**

Belongs:

- Decisions and the reasons for them, including the options that were rejected.
- Architecture: how parts fit together and where responsibilities lie.
- Fixes for recurring problems: the symptom, the cause, and the fix.
- Non-obvious gotchas: things that look wrong but are deliberate, or that break in surprising ways.
- Workflows: building, testing, releasing, installing.
- Outside constraints: how Obsidian, Windows Terminal, PowerShell, WSL, Claude Code or GitHub Actions behave in ways that shape the code.

Never belongs:

- Secrets of any kind: API keys, tokens, passwords, private keys or certificates, `.env` values, connection strings. Not even partly redacted or as an "example".
- Personal data: email addresses (GitHub `noreply` addresses are fine), real names beyond public GitHub handles, local absolute paths that contain a user name, vault paths or note names, session IDs, and the contents of session transcripts or private notes. Write placeholders such as `<session-id>`, `<vault>` or `~/.claude/projects` instead.
- Details of security weaknesses that are not fixed yet. Record a security decision only once its fix has shipped.
- Anything that only repeats the README or the code. Link to it instead, and record the *why* the code can't say.
- Notes that only matter to the current task or conversation.

`test/kb.test.ts` (part of `npm test`) fails on common secret and personal-data patterns in `docs/kb/` and in this skill's folder. It's a backstop, not a substitute for checking.

## 3. Suggesting additions and changes

Suggest a knowledge-base change, unprompted, when:

- a recurring problem has been resolved (record the symptom, cause and fix);
- a large architectural or steering decision has been made (record what was decided, why, and what was rejected);
- anything else came up that would help long-term development, such as a gotcha that cost real time or an outside constraint discovered the hard way;
- an entry turns out wrong or stale (correct it, and update its `updated` date).

Don't suggest one for routine changes the code and commit message already explain.

How to suggest:

1. Search first (section 1), and prefer updating an existing entry over adding a new one.
2. Check the proposed text against section 2.
3. Show the proposed change as a diff, or as the full new entry, including the matching `INDEX.md` line. Say in one line why it's worth keeping.
4. **Wait for approval.** Never write, change or commit knowledge-base files without the user's go-ahead.
5. Once approved, make the entry change and the `INDEX.md` change together, and run `npm test`.

New entries: a kebab-case file name, the header below, then a `#` heading matching the title. Use relative links to other entries and to the README.

```markdown
---
title: <Title>
tags: [<tag>, <tag>]
updated: <YYYY-MM-DD>
---

# <Title>
```
