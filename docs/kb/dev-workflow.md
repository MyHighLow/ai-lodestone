---
title: Development workflow
tags: [workflow, build, testing, install]
updated: 2026-10-11
---

# Development workflow

Install and update steps for users are in the [README](../../README.md). This entry covers what a maintainer needs on top of that.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Runs `test/*.test.ts` with `node --experimental-strip-types --test`. |
| `npm run build` | `tsc --noEmit` (typecheck), then an esbuild production bundle to `main.js`. |
| `npm run dev` | esbuild in watch mode. After each successful rebuild it copies the plugin into the remembered vault. It also creates an empty `.hotreload` file in the plugin folder, which the **Hot Reload** community plugin needs before it reloads a folder that isn't a git checkout. With Hot Reload in that vault, Obsidian reloads Lodestone by itself. |
| `npm run install-plugin [-- <vault>]` | Production build, then copies `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/lodestone/`. |

## Gotchas

- **Tests need Node 22.6 or later** for `--experimental-strip-types`, even though building works on older Node. They also need `bash` on PATH, because some tests run the generated bash scripts. Run them in WSL or Linux.
- **Only the pure modules are tested** (see [architecture.md](architecture.md)). Anything that imports `obsidian`, or launches processes, needs a manual check in a real vault on Windows. Launching throws on any platform other than Windows.
- **`.vault`** remembers the vault path from the last `install-plugin` and is gitignored. It can be a Windows path or a `/mnt/d/…` path; Windows paths are converted when running under WSL. The target must contain a `.obsidian` folder.
- `main.js` is a build output and is gitignored.
- The `obsidian` API package is `latest` in `package.json`, so only `package-lock.json` pins its version. Expect type changes when the lockfile is refreshed.

## Knowledge base

This folder. The `knowledge-base` skill in `.claude/skills/knowledge-base/` explains how to search it, what belongs in it, and when to suggest changes. `test/kb.test.ts` checks that every entry is in [INDEX.md](INDEX.md) and that no secrets or personal data slip in.
