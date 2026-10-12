# AI Lodestone

An Obsidian plugin for starting, saving and resuming [Claude Code](https://claude.com/claude-code) sessions from your notes, in either PowerShell or WSL.

Windows desktop only: it opens console windows using `cmd`, `pwsh` and `wsl.exe`.

## Install

Every merge to main is tagged with a version (such as `0.1.4`) and published as a GitHub prerelease with the three files Obsidian needs: `main.js`, `manifest.json` and `styles.css`. Stable releases are marked **Latest** on the [releases page](https://github.com/MyHighLow/ai-lodestone/releases). Nothing has to be built, and you never type a vault path.

### With BRAT (recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs plugins straight from their GitHub releases and keeps them up to date.

1. In Obsidian, open **Settings → Community plugins** and turn off **Restricted mode** if it's on. Click **Browse**, search for **BRAT**, then install and enable it.
2. Open **Settings → BRAT** and click **Add beta plugin**. (Or run **BRAT: Plugins: Add a beta plugin for testing (with or without version)** from the command palette.)
3. Enter the repository `MyHighLow/ai-lodestone`.
4. Pick a version:
   - **Latest version** follows the newest release, prereleases included, so you get every merge to main.
   - A specific version, such as `0.1.4`, freezes the plugin at exactly that release. Versions marked **(Prerelease)** are per-merge builds.
5. Click **Add plugin**. Then turn **AI Lodestone** on under **Settings → Community plugins**, or tick **Enable after installing the plugin** before clicking **Add plugin** and BRAT turns it on for you.

### By hand, for a specific version

1. Open the version's release page, `https://github.com/MyHighLow/ai-lodestone/releases/tag/X.Y.Z` (or pick one from the [releases page](https://github.com/MyHighLow/ai-lodestone/releases)), and download `main.js`, `manifest.json` and `styles.css`.
2. In Obsidian, open **Settings → Community plugins** and turn off **Restricted mode** if it's on. Click the folder icon next to **Installed plugins** to open your vault's plugins folder.
3. In that folder, create a folder named `ai-lodestone` and put the three files in it.
4. Click the reload icon next to **Installed plugins**, then turn **AI Lodestone** on.

### From source (developers, or a commit with no tag)

You need git and Node 18+ in WSL (or on Windows).

```bash
git clone https://github.com/MyHighLow/ai-lodestone.git
cd ai-lodestone
git checkout <tag-or-commit>   # optional; main by default
npm ci
npm run install-plugin -- "D:\Vaults\MyVault"
```

Then turn **AI Lodestone** on under **Settings → Community plugins** (turn off Restricted mode first if it's on, and click the reload icon next to **Installed plugins** if it isn't listed). The vault path can be a Windows path or a `/mnt/d/…` path; it's remembered in `.vault`.

A source build reports main's stable version (from `manifest.json`), not the tag or commit you built, because each tag's version is written only into its release's `manifest.json`.

## Update

Your settings and session history live in `data.json` in the plugin folder, and every update keeps them.

- **BRAT:** with **Latest version**, run **BRAT: Plugins: Check for updates to all beta plugins and UPDATE**, or turn on **Auto-update plugins at startup** in BRAT's settings. A frozen version stays put until you change it: in **Settings → BRAT**, click the edit button next to AI Lodestone and pick another version.
- **By hand:** download the new version's three files and replace the old ones in `ai-lodestone`, leaving `data.json` where it is. Then turn the plugin off and on, or restart Obsidian.
- **From source:** `git pull` (or check out another tag or commit), then `npm ci` and `npm run install-plugin`, which installs into the remembered vault. Then turn the plugin off and on, or restart Obsidian.

### Moving from an install named Lodestone

The plugin used to be called Lodestone, with the id `lodestone`. It's now AI Lodestone (`ai-lodestone`), because the old id was already taken in Obsidian's community plugins. Obsidian keeps each plugin in a folder named after its id, so an existing install needs moving once:

1. Quit Obsidian, so the old copy can't write its settings again.
2. Install the new version as above. It goes into `<vault>/.obsidian/plugins/ai-lodestone/`.
3. Move `data.json` (your settings and session history) from `<vault>/.obsidian/plugins/lodestone/` into the new `ai-lodestone` folder.
4. Delete the old `lodestone` folder, so there aren't two copies.
5. Open Obsidian and enable **AI Lodestone** under **Settings → Community plugins**.

Notes and their `claude-session` and `claude-prompt` blocks don't change. Hotkeys you set for its commands don't carry over, because Obsidian stores them by plugin id: set them again under **Settings → Hotkeys**.

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
- **Card details**: AI Lodestone finds the session's saved conversation file in both your Windows and WSL `~/.claude/projects` folders. It shows which install owns the session, when it was last active, how many prompts it has, its working directory, and your latest prompt.
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
- **What you see is what gets sent.** The card shows the prompt with placeholders already filled in. Invisible and text-direction characters, which could make a prompt read differently from what's sent, are removed from both the preview and the prompt, and the card says how many it dropped. A long prompt starts collapsed: clicking Run or Copy command expands it for review first, and the next click runs it.
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

The command **Browse recent sessions** lists every session AI Lodestone has started or resumed, including ones from the header button. You can search by title, note or ID.

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
| Claude command (PowerShell / WSL) | `claude` | Use a full path if `claude` isn't on PATH. On Windows, a `claude` that resolves to a `.cmd`/`.bat` file is refused, because cmd.exe would re-parse the prompt; use `claude.exe` (the native installer) or npm's `claude.ps1`. |
| WSL distro | (your default) | Same as `wsl -d <name>`. |
| WSL sessions folder | auto-detected | Found by running `wslpath -w ~/.claude/projects`. |
| Windows drive mount root | `/mnt` | Used to convert `D:\x` into `/mnt/d/x`. |

## Disclosures

AI Lodestone's job is to start programs outside Obsidian, so it does more than most plugins:

- **It runs programs on your computer:** `cmd.exe` (to open each window), Windows PowerShell or `pwsh`, `wsl.exe`, Windows Terminal (`wt.exe`) if you use it, and `claude`, inside the window it opens. To find things, it also runs `wslpath` inside WSL (where WSL keeps sessions) and Windows PowerShell (to look for a Windows Terminal shortcut).
- **It reads files outside your vault:** session transcripts in `~/.claude/projects`, in Windows and in WSL (or the folders set in settings), and the Start Menu and taskbar shortcuts while looking for Windows Terminal.
- **It writes files outside your vault:** each launch writes a short script to your temp folder, which the new window runs and then deletes.
- **It uses the clipboard:** Copy command buttons write to it, and **Insert Claude session block** reads it to fill in the block.
- **No network access and no telemetry.** It makes no network requests itself and sends nothing anywhere. Claude Code, once started, is a separate program with its own behaviour.

## Troubleshooting

- **The WSL window opens, but `claude: command not found`.** AI Lodestone runs `bash -lic`, so anything your `~/.bashrc` or `~/.profile` adds to PATH is available. If claude lives somewhere else, set **Claude command (WSL)** to its full path.
- **The session card says "not found".** Check that the session folder settings point to the right place. Auto-detection asks WSL and gives up after 15 seconds; if it fails, set **WSL sessions folder** by hand. Changing the WSL distro or a sessions-folder setting retries detection. A session that was just started only gets a transcript after its first message.
- **Resume says the session doesn't exist.** Sessions belong to one install. A session created in WSL can't be resumed by Windows claude, and the reverse is also true. The card's badge shows which install owns it.

- **A notice says it used a console window because a path contains `%`.** Windows Terminal expands `%NAME%` in the command it's given and can't escape it, so if your temp folder (usually under your Windows user name) contains `%`, AI Lodestone uses a console window for that launch instead.
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

### Rebuilding while you develop

`npm run install-plugin -- "<vault>"` (see [From source](#from-source-developers-or-a-commit-with-no-tag)) remembers the vault in `.vault`. To install into a different vault, pass its path again; the new path becomes the remembered one.

`npm run dev` rebuilds and re-copies into the remembered vault on every save. Install the community plugin **Hot Reload** in that vault, and Obsidian picks up each rebuild by itself. (The dev build adds the `.hotreload` marker file Hot Reload looks for.)

### Versioning

Versions are plain `X.Y.Z`, kept the same in `package.json`, `package-lock.json` and `manifest.json`, and listed in `versions.json`.

- **Every merge to main is tagged.** `.github/workflows/release.yml` tags the merge commit with the next plain `X.Y.Z` (no `v`): one patch above the highest tag, or above main's version if that's higher. Merges that only change Markdown files, or files under `.github/` other than workflows, are skipped. CI makes no commit, so main's version files don't move.
- **PRs don't change the version.** The **Version check** workflow fails a PR that changes the `version` field in `package.json`, `package-lock.json` or `manifest.json`, or anything in `versions.json`. Other `manifest.json` edits are fine.
- **Main's `manifest.json` holds the latest stable version.** It changes only in a stable release, which is also where minor and major bumps are chosen. The community store reads it to find the version to install.
- **Tags are only created by CI.** `npm version` never commits or tags here (`.npmrc` sets `git-tag-version=false`); its `version` script copies the version into `manifest.json` and `versions.json`. To run the checks locally, fetch first: `node scripts/check-version.mjs next` prints the tag CI would create (it fails on a branch that doesn't contain the latest tag), and `node scripts/check-version.mjs pr "$(git merge-base origin/main HEAD)"` runs the PR check against committed `HEAD`, so commit before running it. Use the merge base, not main's tip: CI compares against the main commit the PR merges into, and a stable release on main since you branched would otherwise look like your change.

### Releases

- **Every tag gets an installable prerelease.** After tagging a merge, `release.yml` builds that tag (**Build release**) and publishes it as a GitHub prerelease (**Publish prerelease**) with `main.js`, `manifest.json` (with the tag's version written in) and `styles.css`, plus a build provenance attestation (`gh attestation verify main.js -R MyHighLow/ai-lodestone`). It isn't marked Latest, and its notes are GitHub's generated list of changes. To retry a tag or publish an older one, run **Publish prerelease** by hand: `gh workflow run publish-prerelease.yml -f tag=X.Y.Z`. Tags before 0.1.3 can't be published: their manifest has the old id `lodestone`.
- **Stable releases are made on purpose** with the **Stable release** workflow (`stable-release.yml`), from main. Give it your release notes and exactly one of:
  - `tag`: promote that tag's prerelease to the stable release, with exactly the same files; or
  - `bump` (`patch`, `minor` or `major`): cut a new version, applied to the highest tag or the stable version, whichever is higher. It makes a `Release X.Y.Z` commit on main's current commit, tags it, and builds that tag.

  The first job only reads: it checks the inputs and shows what the run will do in the run's summary. Nothing is written until a reviewer approves the run in the `stable-release` environment (Settings → Environments). Then it publishes a full release marked Latest, with your notes followed by GitHub's generated list of changes since the last stable release, and sets main's `manifest.json` and `versions.json` (and `package.json`) to the new version. That's the version the community store installs.
- **Multi-line notes:** the Run workflow form takes one line, so use the CLI: `gh workflow run stable-release.yml -f notes="$(cat notes.md)" -f bump=minor` (or `-f tag=X.Y.Z`).
- **A merge during a cut gets no tag.** A cut pushes its tag first and updates main only after the release is published. A merge that lands in between fails Release's tagging (the newest tag isn't in its history yet), so it gets no tag or prerelease; its changes ship in the next tag. If a cut fails after pushing its tag, re-run the failed jobs: until main contains the tag, merges aren't tagged.

### Knowledge base

[`docs/kb/INDEX.md`](docs/kb/INDEX.md) collects what isn't obvious from the code: architecture, why launches are quoted the way they are, past decisions and gotchas. In Claude Code sessions in this repo, the `knowledge-base` skill (`.claude/skills/knowledge-base/`) is available automatically. It searches the knowledge base and suggests additions. Apart from that skill, `.claude/` is kept out of version control on purpose.
