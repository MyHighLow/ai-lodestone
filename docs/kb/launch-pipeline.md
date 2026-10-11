---
title: Launch pipeline and quoting rules
tags: [launch, quoting, security, windows, wsl, windows-terminal]
updated: 2026-10-11
---

# Launch pipeline and quoting rules

How a launch gets from Obsidian to a terminal running claude, and why each step is the way it is. Most of these rules came from security audits; don't loosen one without reading why it exists. The code is in `src/scripts.ts` (pure, tested) and `src/launcher.ts`.

## The prompt goes in a temp script, never on a command line

The prompt comes from a note, so it is untrusted text. It is written into a temporary `.ps1` or `.sh` file and never passes through cmd, PowerShell or `wsl.exe` command-line parsing.

- The file has a random name in the OS temp folder and is created with flag `wx` and mode `0600`, so it fails rather than write through anything already at that path.
- The script deletes itself as its first line. If the launch fails before the script runs, `launchInTerminal` deletes it.
- PowerShell scripts start with a UTF-8 BOM so Windows PowerShell 5.1 reads them as UTF-8.

## Claude arguments

- The prompt always comes after `--`, so even if a shell splits it, no piece can become a claude option.
- `--name=<value>` is one token, so no shell can separate the option from its value. The name has `"`, control characters, invisible characters and trailing `\` removed (`sessionNameArg`).
- The prompt is run through `stripInvisible` again inside `newSessionArgs`, for every launch path. See [invisible-characters.md](invisible-characters.md).

## The cmd.exe line holds no variable text

`buildLaunchCommand` produces a line for `cmd.exe /d /v:off /s /c "<line>"` (spawned with `windowsVerbatimArguments`). Every variable part (script path, PowerShell path, WSL distro, title, `wt.exe` path) is passed as a `LODESTONE_*` environment variable and referenced as `%LODESTONE_*%` inside double quotes.

- cmd expands `%VAR%` once, before parsing, and never re-parses the result, so `%`, `&`, `^` or `'` in a value is just text. This matters because the temp path contains the Windows user name.
- Values containing `"` or control characters are rejected with an error.
- `/v:off` keeps `!VAR!` literal even if the registry turns on delayed expansion.

## Windows Terminal

- `wt.exe` expands `%VARS%` in the command line it's given, a second time, and has no way to escape `%`. So if a value wt would read contains `%`, the launch falls back to a console window and tells the user why (`fallbackReason`).
- `wt` splits its own command line on `;`. A literal semicolon is `\;`.
- The window title goes through `consoleTitle`, which removes `"`, `%`, `;`, control and invisible characters and caps the length at 80.
- Detection (`findWindowsTerminal`): the path from settings if set; otherwise the Store alias, winget and scoop locations; otherwise a Start Menu or taskbar shortcut that points at Windows Terminal. Auto-detection runs once per Obsidian session; a path from settings is checked again on every launch.
  - The Store `wt.exe` is an app execution alias that `stat` can't follow, so existence checks use `lstat`.
  - Shortcuts on the Desktop or in download folders are deliberately ignored: that's where extracted archives and cloned repos land, and a planted shortcut would choose the program every launch runs.
  - Given `WindowsTerminal.exe`, it prefers the sibling `wt.exe`.

## WSL

The launch runs `wsl.exe [-d <distro>] --cd ~ --exec bash -lic "source '<script>'"`.

- `-l -i`: a login, interactive shell reads `~/.profile` and `~/.bashrc`, so PATH additions such as nvm or `~/.local/bin` apply. Without them `claude` is often "command not found".
- The script path is shell-quoted (`shQuote`), which covers user names with apostrophes and an unusual mount root.
- The script `cd`s to the session folder, runs claude, then `exec bash -l` so a shell stays open in that folder after claude exits.
- The claude command itself is *not* quoted in bash, so users can set it to `npx claude` or an alias.
- Windows paths are converted with the **Windows drive mount root** setting (`/mnt` by default): `D:\x` becomes `/mnt/d/x`, and `\\wsl.localhost\<distro>\home\<name>` becomes `/home/<name>`.

## PowerShell

PowerShell runs with `-NoLogo -NoExit -ExecutionPolicy Bypass -File <script>`. Which claude it runs, and how arguments reach it, is in [powershell-claude.md](powershell-claude.md).
