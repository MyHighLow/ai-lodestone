---
title: Running claude from PowerShell
tags: [powershell, launch, quoting, security, windows]
updated: 2026-10-11
---

# Running claude from PowerShell

Which `claude` a PowerShell launch runs, and how the arguments are passed on each PowerShell version. Code: `psResolveClaude` and `buildPowershellScript` in `src/scripts.ts`.

## Resolve claude once, with an allowlist

The script looks up the configured command (default `claude`) once with `Get-Command -CommandType Application,ExternalScript`, keeps the first match that is either a PowerShell script or a `.exe`/`.com` program, stores it in `$resolved`, and then runs `$resolved`, never the name again. What runs is exactly what was checked.

- **`.cmd` and `.bat` shims are refused.** PowerShell runs them through cmd.exe, which re-parses the prompt (`%VARS%`, `&`, `|`), so text in a note could run as commands. The user is told to point the setting at `claude.exe` (native installer) or npm's `claude.ps1`.
- Aliases and functions are skipped, and so is anything else Windows hands to another program (`.vbs`, `.js`, a trailing-dot name).
- PowerShell wildcard characters in the configured name are escaped, so `Get-Command` takes it literally.
- If nothing qualifies, the script prints an error and stops. It does not fall back to a less safe option.
- The **Copy command** for PowerShell uses the same lookup, so a pasted command never reaches a batch shim either.

## Argument passing depends on the PowerShell version

PowerShell has changed how it builds native command lines, and older versions mangle embedded `"`. The script decides at run time:

| Situation | What the script does |
| --- | --- |
| Native `claude.exe` on Windows PowerShell 5.1 | Starts it with `System.Diagnostics.ProcessStartInfo`, using a command line built by `windowsArg` (MSVC / `CommandLineToArgvW` rules). No pre-escaping can fix 5.1's handling of `"`. |
| Native `claude.exe` on PowerShell 6–7.2, or 7.3+ with `$PSNativeCommandArgumentPassing = 'Legacy'` | Passes arguments pre-escaped by `escapeForLegacyNative`. These versions quote correctly except for `"`. |
| A PowerShell script (`claude.ps1`) on those older versions, when an argument needs escaping | Refuses with a message. The `.ps1` passes the arguments on to `node.exe` with this PowerShell's quoting, which can't be pre-escaped reliably. Sending a different prompt is worse than not starting. |
| PowerShell 7.3+ (Standard mode), or any `.ps1` when no escaping is needed | Passes arguments as they are. |

Gotchas behind the 5.1 branch:

- `Set-Location` only moves PowerShell's own location, not the process working directory, so `ProcessStartInfo.WorkingDirectory` is set explicitly. Without it claude.exe started in the wrong folder.
- `escapeForLegacyNative` doubles a trailing backslash when the argument contains whitespace, because PowerShell adds quotes around it. .NET counts U+0085 as whitespace when deciding to add those quotes, and JavaScript's `\s` doesn't, so U+0085 is checked explicitly.

## Choosing PowerShell

With the setting on `auto`, Lodestone uses `C:\Program Files\PowerShell\7\pwsh.exe` if it exists, otherwise `powershell.exe` (5.1).
