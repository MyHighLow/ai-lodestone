---
title: Architecture
tags: [architecture, modules, testing]
updated: 2026-10-11
---

# Architecture

How the `src/` modules fit together. For what the plugin does from a user's point of view, see the [README](../../README.md).

## Pure core, thin Obsidian shell

The code is split so that everything risky (quoting, parsing, sanitizing) is pure and can be unit tested in plain Node, without Obsidian:

| Module | Pure? | Role |
| --- | --- | --- |
| `scripts.ts` | yes | Claude arguments, shell quoting, the PowerShell and bash launch-script bodies, the copyable commands, and the `cmd /c` launch line. |
| `parse.ts` | yes | `claude-session` and `claude-prompt` block parsing, run-history lines, fence titles, formatting inserted session blocks. |
| `sanitize.ts` | yes | `stripInvisible`: removes invisible and text-direction characters. See [invisible-characters.md](invisible-characters.md). |
| `transcript.ts` | yes | Summarizes a session transcript (`.jsonl`) into title, prompt count, cwd, times. |
| `util.ts` | yes | Relative time, truncation, WSL-to-Windows path conversion. |
| `launcher.ts` | no | Writes the temporary launch script, finds Windows Terminal, spawns `cmd.exe`, asks WSL where its sessions live. |
| `sessions.ts` | no | `SessionStore`: finds a session's transcript in the Windows or WSL store. See [session-ownership.md](session-ownership.md). |
| `main.ts` | no | The plugin class: commands, header button, right-click menu, path conversion, placeholder expansion, launch and resume orchestration, launch history. |
| `blocks/` | no | Renderers for the two code blocks, plus shared card helpers in `common.ts`. |
| `historyModal.ts`, `settings.ts`, `icon.ts`, `types.ts` | — | Browse-sessions modal, settings tab, the Lodestone icon, shared types and defaults. |

Rule of thumb: logic that decides *what text* reaches a shell or claude belongs in a pure module with tests. The impure modules should only do I/O with the result.

Pure modules that the tests load import each other with an explicit `.ts` extension (for example `import { stripInvisible } from "./sanitize.ts"` in `scripts.ts`), because Node runs them directly. `tsconfig.json` sets `allowImportingTsExtensions` for this.

## Launch flow

1. A button or command calls `main.launchNew` (new session) or `main.resume`.
2. `main` builds a `LaunchSpec` (env, cwd in that env's path style, claude arguments). New sessions get a UUID from `crypto.randomUUID()` and pass it as `--session-id`, so Lodestone can record the session in its history before claude has written anything.
3. `launcher.launchInTerminal` writes a self-deleting temp script (`buildPowershellScript` or `buildBashScript`), then runs the line from `buildLaunchCommand` through `cmd.exe`.

Why it's built this way: [launch-pipeline.md](launch-pipeline.md) and [powershell-claude.md](powershell-claude.md).

## State

Settings and launch history are saved together through Obsidian's `saveData` (`PluginData` in `types.ts`). History is most-recent-first, de-duplicated by session ID, and capped at `historyLimit`. Prompt-block run history is stored in the note itself, below a `---` line inside the block.
