# Lodestone

An Obsidian plugin for starting, saving and resuming [Claude Code](https://claude.com/claude-code) sessions from your notes, in either PowerShell or WSL.

Windows desktop only: it opens console windows using `cmd`, `pwsh` and `wsl.exe`.

## Install

You need Node 18+ in WSL (or on Windows) to build it.

```bash
cd ~/git/lodestone
npm install
npm run install-plugin -- "D:\Vaults\MyVault"
```

Then in Obsidian, open **Settings → Community plugins**, turn off Restricted mode if it's on, and enable **Lodestone**. You may need to click the reload icon next to "Installed plugins" first.

The vault path can be a Windows path or a `/mnt/d/…` path. It's remembered in `.vault`.

## Update

```bash
npm run install-plugin
```

This rebuilds and copies into the remembered vault. Then toggle the plugin off and on in Obsidian, or restart Obsidian.

### Updating while you develop

`npm run dev` rebuilds and re-copies into the remembered vault on every save. Install the community plugin **Hot Reload** in that vault, and Obsidian picks up each rebuild by itself.

To install into a different vault, pass its path again. The new path becomes the remembered one.

## Features

### 1. The Claude button (top right of every note)

- **Click** opens a new terminal in the note's folder. It starts `claude` with a prompt telling it to read the note and then wait for your instructions. You can change that prompt in settings.
- **Right-click** to change *how* Claude opens: **PowerShell** or **WSL**, and **Windows Terminal** or a **console window**. The menu only changes the setting; it doesn't launch anything. The same menu (and the same setting) is on every Claude button: the header button, Run, Resume, and Copy command.

The same action is in the command palette as **Launch Claude with current note**.

### 2. Session blocks: resume an existing session

Run `/status` in Claude and paste the output (or just the session ID) into a `claude-session` block:

````markdown
```claude-session My Custom Override Title
Session name:      Refactor the parser
Session ID:        3f8a2c1e-9b47-4d6a-a5e2-7c0d1b9e4f36
```
````

- **Title**: anything after `claude-session` on the first line becomes the card's title. Without it, the card uses the session name, or else the session's auto-generated title.
- **Card details**: Lodestone finds the session's saved conversation file in both your Windows and WSL `~/.claude/projects` folders. It shows which install owns the session, when it was last active, how many prompts it has, its working directory, and your latest prompt.
- **Resume** opens the session in the install that owns it, from the session's original folder. A session belongs to the shell it was created in, so it always resumes there, whatever the default is. The right-click menu says which shell owns it. If the transcript can't be found, the default is used.
- **Copy command** copies a `cd … ; claude --resume <id>` line to paste into your own terminal.

The command **Insert Claude session block** fills the block in from your clipboard if the clipboard holds `/status` output or a session ID.

### 3. Prompt blocks: start a new session from a saved prompt

````markdown
```claude-prompt Summarize this note
Summarize {{file}} and list the action items.
```
````

- **Run** starts a new session in the note's folder with this prompt, in your default shell. The session is named after the block title. Right-click to change the default.
- **Copy command** copies the equivalent `claude` command for your default shell.
- **Placeholders**: `{{file}}`, `{{path}}` and `{{vaultPath}}` are filled in with the note's file name, full path, and path inside the vault.
- **Run history**: each Run adds a line below a `---` inside the block, and the block itself never changes into anything else. The history shows up as **Previous runs**, where each run has a Resume and a Copy button:

  ````markdown
  ```claude-prompt Summarize this note
  Summarize {{file}} and list the action items.
  ---
  2026-10-10 15:42 | wsl | 3f8a2c1e-9b47-4d6a-a5e2-7c0d1b9e4f36
  ```
  ````

  Right-click a run to copy its ID or **Insert as session block below**.

### 4. Browse recent sessions

The command **Browse recent sessions** lists every session Lodestone has started or resumed, including ones from the header button. You can search by title, note or ID.

- **Enter** resumes the selected session.
- **Ctrl+Enter** inserts it as a `claude-session` block at the cursor.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Default terminal | PowerShell | PowerShell or WSL. Used by the header button and prompt blocks; also set from any right-click menu. |
| Terminal app | Windows Terminal (if installed) | Opens sessions in Windows Terminal; uses a plain console window if `wt.exe` isn't found. |
| Windows Terminal window | New tab in last-used window | Or open each session in a window of its own. |
| Windows Terminal path | auto-detected | Finds the Store/winget/scoop install, or a portable (zip) copy through its Start Menu or taskbar shortcut. Set it by hand if needed. |
| New-session prompt | "Read the note … then wait" | The prompt the header button sends. |
| Name sessions | on | Passes the title to `claude --name`. |
| PowerShell executable | auto | Uses pwsh 7 if it's installed, otherwise `powershell.exe`. |
| Claude command (PowerShell / WSL) | `claude` | Use a full path if `claude` isn't on PATH. |
| WSL distro | (your default) | Same as `wsl -d <name>`. |
| WSL sessions folder | auto-detected | Found by running `wslpath -w ~/.claude/projects`. |
| Windows drive mount root | `/mnt` | Used to convert `D:\x` into `/mnt/d/x`. |

## Troubleshooting

- **The WSL window opens, but `claude: command not found`.** Lodestone runs `bash -lic`, so anything your `~/.bashrc` or `~/.profile` adds to PATH is available. If claude lives somewhere else, set **Claude command (WSL)** to its full path.
- **The session card says "not found".** Check that the session folder settings point to the right place. The WSL distro must be running for auto-detection to work. A session that was just started only gets a transcript after its first message.
- **Resume says the session doesn't exist.** Sessions belong to one install. A session created in WSL can't be resumed by Windows claude, and the reverse is also true. The card's badge shows which install owns it.

- **Sessions open in a console window instead of Windows Terminal.** Check **Windows Terminal path** in settings; it shows what was detected. For a portable copy with no shortcut, point it at `wt.exe` in the folder you unzipped.

## Development

```bash
npm test        # unit tests: parsing, quoting, path conversion, transcript summaries
npm run build   # typecheck + production bundle
```

| File | What's in it |
| --- | --- |
| `src/scripts.ts` | Builds the launch scripts and the copyable commands (pure, unit tested). |
| `src/launcher.ts` | Writes a temporary script that deletes itself, then opens it with `cmd /c start`. |
| `src/sessions.ts`, `src/transcript.ts` | Find and summarize session transcripts. |
| `src/blocks/` | The two code-block renderers. |
