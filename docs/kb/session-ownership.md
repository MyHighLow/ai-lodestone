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
- WSL: the **WSL sessions folder** setting, else auto-detected by running `wslpath -w "$HOME/.claude/projects"` through `wsl.exe`. This returns a `\\wsl.localhost\…` path that Obsidian can read. `wsl.exe` starts the distro if it's stopped, but detection gives up after 15 seconds, and a failed detection is cached as "no WSL store" until a sessions-folder or WSL distro setting changes or Obsidian restarts.

If both stores have the file, the most recently modified one wins. Found paths are cached; misses are cached for 30 seconds so a missing session doesn't trigger a folder scan on every render. Changing either sessions-folder setting or the WSL distro calls `reset()`, which clears all of this.

A session that was just started has no transcript until its first message, so the card shows "not found" until then.

## Choosing where to resume

`main.resolveResume` picks, in order:

- **Shell:** an explicit override, then the store the transcript was found in, then Lodestone's launch history, then the default shell.
- **Folder:** the transcript's `cwd` if there is one, else the history's; converted between `D:\…` and `/mnt/d/…` styles if needed. If there's none, or it can't be converted (a WSL-only path such as `/home/…` for PowerShell), the note's folder. The history's `cwd` is not tried when the transcript's can't be converted. Last resort: `~` in WSL, or the vault folder in PowerShell.
- **Title:** an explicit title, then the transcript's (a `/rename` or `--name` title, else the auto-generated one), then history, then the first 8 characters of the ID.

## Transcript format

`summarizeTranscript` in `src/transcript.ts` counts only prompts the user typed. Tool results, sidechain and meta entries, and text that starts with `<` (slash commands, command output, system reminders) are skipped. A partly written last line is ignored. The format is Claude Code's, not ours, so if card details stop showing up after a Claude Code update, check this first.
