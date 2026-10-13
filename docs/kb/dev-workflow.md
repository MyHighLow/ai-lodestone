---
title: Development workflow
tags: [workflow, build, testing, install]
updated: 2026-10-13
---

# Development workflow

Install and update steps for users are in the [README](../../README.md). This entry covers what a maintainer needs on top of that.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Runs `test/*.test.ts` with `node --experimental-strip-types --test`. |
| `npm run build` | `tsc --noEmit` (typecheck), then an esbuild production bundle to `main.js`. |
| `npm run dev` | esbuild in watch mode. After each successful rebuild it copies the plugin into the remembered vault. It also creates an empty `.hotreload` file in the plugin folder, which the **Hot Reload** community plugin needs before it reloads a folder that isn't a git checkout. With Hot Reload in that vault, Obsidian reloads the plugin by itself. |
| `npm run install-plugin [-- <vault>]` | Production build, then copies `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/<id>/`, where `<id>` is the `id` in `manifest.json` (currently `ai-lodestone`; it was `lodestone` before #5). |

## Gotchas

- **Tests need Node 22.6 or later** for `--experimental-strip-types`, even though building works on older Node. They also need `bash` on PATH, because some tests run the generated bash scripts. Run them in WSL or Linux.
- **Mostly the pure modules are tested** (see [architecture.md](architecture.md)). `test/launcher.test.ts` also loads `launcher.ts`, but only covers its non-Windows paths, where launching throws and detection returns `null` without spawning anything. `test/sessions.test.ts` loads `sessions.ts` and looks up sessions in temp folders. Anything that imports `obsidian`, or actually launches processes, needs a manual check in a real vault on Windows.
- **`.vault`** remembers the vault path from the last `install-plugin` and is gitignored. It can be a Windows path or a `/mnt/d/…` path; Windows paths are converted when running under WSL. The target must contain a `.obsidian` folder.
- `main.js` is a build output and is gitignored.
- The `obsidian` API package is pinned to an exact version in `package.json` (since #5). Bump it on purpose. When you do, check that nothing new is used above `minAppVersion` in `manifest.json`: `eslint-plugin-obsidianmd`'s `no-unsupported-api` rule reports that, and it's how a `getFileByPath` call that needed 1.5.7 was found.

## Knowledge base

This folder. The `knowledge-base` skill in `.claude/skills/knowledge-base/` explains how to search it, what belongs in it, and when to suggest changes. `test/kb.test.ts` checks that every entry is in [INDEX.md](INDEX.md) and that no secrets or personal data slip in.
