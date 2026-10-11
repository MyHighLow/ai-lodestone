# Lodestone knowledge base

What maintainers need to know that isn't obvious from the code or the [README](../../README.md): how the parts fit together, why things are done the way they are, past decisions, and gotchas.

Each entry covers one topic and starts with a short header (title, tags, last updated). The `knowledge-base` skill in `.claude/skills/knowledge-base/` explains how to search this folder, what belongs here, and when to suggest changes.

**This repository is public, so everything here is public.** No secrets, credentials or personal data.

## Entries

| Entry | Summary | Tags |
| --- | --- | --- |
| [architecture.md](architecture.md) | What each `src/` module does, the pure-core split that makes testing possible, the launch flow, and where state is stored. | architecture, modules, testing |
| [launch-pipeline.md](launch-pipeline.md) | Temp launch scripts, the `cmd.exe` line built from environment variables, Windows Terminal's `%` and `;` handling and detection, and WSL's `bash -lic`. | launch, quoting, security, windows, wsl, windows-terminal |
| [powershell-claude.md](powershell-claude.md) | Resolving claude with an allowlist (why `.cmd`/`.bat` is refused) and passing arguments correctly on PowerShell 5.1, 6–7.2 and 7.3+. | powershell, launch, quoting, security, windows |
| [invisible-characters.md](invisible-characters.md) | Which invisible and text-direction characters are stripped or kept, where stripping happens, and why long prompts must be read first. | prompt-blocks, sanitizing, security, unicode |
| [session-ownership.md](session-ownership.md) | Windows and WSL session stores, how a session is found, and how the shell, folder and title for a resume are chosen. | sessions, resume, wsl, windows, transcripts |
| [security-hardening.md](security-hardening.md) | Threat model and the shipped decisions from the security audits, with links to the details. | security, decisions, audit |
| [dev-workflow.md](dev-workflow.md) | Build, test, dev and install commands, and their gotchas (Node version, bash, `.vault`). | workflow, build, testing, install |
| [claude-config-in-git.md](claude-config-in-git.md) | Why only explicitly requested Claude Code setup is versioned, and how the `.gitignore` allowlist enforces it. | decisions, claude-code, git, workflow |
