---
title: Session ownership (Windows vs WSL)
tags: [sessions, resume, wsl, windows, transcripts]
updated: 2026-10-11
---

# Session ownership (Windows vs WSL)

Claude Code on Windows and Claude Code in WSL are separate installs with separate session stores. A session can only be resumed by the install that created it, so Lodestone always resumes a session in the shell that owns it, whatever the default shell is.

## Finding a session

`SessionStore` in `src/sessions.ts` looks for `<session-id>.jsonl` in every project folder of both stores:

- Windows: the **Windows sessions folder** setting, else `~/.claude/projects` of the Windows user.
- WSL: the **WSL sessions folder** setting, else auto-detected by running `wslpath -w "$HOME/.claude/projects"` through `wsl.exe`. This returns a `\\wsl.localhost\…` path that Obsidian can read. It only works while the distro is running.

If both stores have the file, the most recently modified one wins. Found paths are cached; misses are cached for 30 seconds so a missing session doesn't trigger a folder scan on every render. Changing settings calls `reset()`.

A session that was just started has no transcript until its first message, so the card shows "not found" until then.

## Choosing where to resume

`main.resolveResume` picks, in order:

- **Shell:** an explicit override, then the store the transcript was found in, then Lodestone's launch history, then the default shell.
- **Folder:** the transcript's `cwd`, then the history's, then the note's folder. The path is converted between `D:\…` and `/mnt/d/…` styles if needed. A WSL-only path such as `/home/…` can't be converted for PowerShell.
- **Title:** an explicit title, then the transcript's (a `/rename` or `--name` title, else the auto-generated one), then history, then the first 8 characters of the ID.

## Transcript format

`summarizeTranscript` in `src/transcript.ts` counts only prompts the user typed. Tool results, sidechain and meta entries, and text that starts with `<` (slash commands, command output, system reminders) are skipped. A partly written last line is ignored. The format is Claude Code's, not ours, so if card details stop showing up after a Claude Code update, check this first.
