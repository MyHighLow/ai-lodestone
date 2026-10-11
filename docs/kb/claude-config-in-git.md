---
title: Claude Code setup in version control
tags: [decisions, claude-code, git, workflow]
updated: 2026-10-11
---

# Claude Code setup in version control

**Decision (issue #7):** only Claude Code configuration that the owner explicitly asks to publish goes into version control. Today that is just the `knowledge-base` skill. Everything else under `.claude/` (other skills, instructions, settings) and `CLAUDE.md` stays local to each checkout.

## How it's enforced

The tracked `.gitignore` uses a default-deny allowlist:

```gitignore
.claude/*
!.claude/skills/
.claude/skills/*
!.claude/skills/knowledge-base/
```

Git can't re-include a file inside a directory that is itself excluded. So `.claude/` must not be excluded as a whole anywhere, including a checkout's local `.git/info/exclude`. Exclude its contents (`.claude/*`) instead, as above.

## Publishing another skill later

Only when the owner asks for it: add `!.claude/skills/<name>/` to `.gitignore`, then check with:

```bash
git check-ignore -v .claude/skills/<name>/SKILL.md   # should print nothing
git ls-files .claude                                 # after adding: only the allowlisted skills
```
