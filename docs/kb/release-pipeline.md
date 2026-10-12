---
title: Release pipeline
tags: [releases, ci, github-actions, decisions, security]
updated: 2026-10-11
---

# Release pipeline

How prereleases and stable releases are made, and why (#3, PR #14). The steps and commands are in the README's [Releases](../../README.md#releases) section; this entry records the reasons and the traps. Tagging itself (one plain `X.Y.Z` tag per merge to main) comes from #2 and lives in `.github/workflows/release.yml` and `scripts/check-version.mjs`.

## Decisions

- **Two channels.** Every tag gets an installable GitHub prerelease. A stable release is a separate, deliberate step behind an approval gate, and it's the only one with written notes. The owner wanted every version installable, like a nightly build, but releases made on purpose. Rejected: a release with notes on every merge, with the notes taken from GitHub's generated list, the PR body, or a CHANGELOG each PR had to update.
- **The prerelease hooks in with `needs: tag`, not a `push: tags` trigger.** Tags pushed with `GITHUB_TOKEN` don't start other workflows, so a tag trigger would never fire. A personal access token would make it fire, but it was rejected: no stored secrets. The `prerelease` job sits outside the `tag-main` concurrency group, because that group cancels a job that's still waiting when a newer one queues.
- **npm runs only where nothing can be written.** `build-release.yml` is the only release workflow that runs `npm ci`, and its token can only read. The jobs that publish download its artifact and run nothing but GitHub's own actions, `git`, `gh`, and `npm version` with the repo's dependency-free version script. A compromised dependency can break a build, but it never holds a write token.
- **The tag's version goes only into the release's copy of `manifest.json`.** The build writes it with `jq`, not with a repo script, so an older tag builds the same way. Main's `manifest.json` keeps the stable version, because the community store reads it to decide what to install.
- **The build refuses any manifest id other than `ai-lodestone`.** Tags before 0.1.3 carry the old id `lodestone`, which belongs to another plugin in the store, so they never get a prerelease.
- **Stable releases: `workflow_dispatch` plus a GitHub Environment.** The `stable-release` environment requires the owner's approval and allows runs from `main` only. Only the `approve` job is in it, so a run needs one approval. Every later job that writes depends on that job. Nothing is stored as a secret.
- **Promote or cut.** A promote turns an existing prerelease into the stable release, with the same files and no rebuild. A cut makes a new `Release X.Y.Z` commit and tag for a patch, minor or major bump. Both were wanted. A cut is built from the main commit `prepare` showed the reviewer, not whatever main has become by the time it's approved.
- **The generated list of changes is made after the gate.** GitHub's `releases/generate-notes` API needs Contents **write**, and giving the pre-approval `prepare` job write access was rejected. So the reviewer sees the typed notes and a compare link, and the `approve` job generates the final notes.
- **Main's version files change only after the release exists.** Otherwise the store could see a version with no release behind it. A cut merges its tag commit into main (a fast-forward if main hasn't moved), so the stable tag stays in main's history. `check-version.mjs next` refuses to tag a commit unless the highest tag is in its history. The push uses `GITHUB_TOKEN`, so it starts no Release run and gets no extra tag.
- **Stable release has its own concurrency group,** not `tag-main`, because a merge to main would cancel a run waiting for approval there. Collisions with automatic tags are caught by the tag push, which is never forced.

## Gotchas

- **Create the environment before the workflow reaches main.** If a job names an environment that doesn't exist, GitHub creates it on the first run with no protection, and that run would skip the gate. By default, repository admins can bypass the required reviewer.
- **A merge during a cut gets no tag.** The cut pushes its tag before main contains it. Until main is updated, Release's tag job fails the ancestor check, so that merge gets no tag or prerelease, and its changes ship in the next tag. If the cut fails after pushing its tag, merges stay untagged until the failed jobs are re-run, or until the tag is deleted (`git push origin :refs/tags/X.Y.Z`) when the failure would happen every time.
- **The Run workflow form takes one line.** Multi-line notes have to come through `gh workflow run stable-release.yml -f notes="$(cat notes.md)" …`.
- **`workflow_dispatch` runs the selected branch's copy of the workflow.** A copy changed on another branch could skip any check, so the main-only branch rule on the environment is what actually protects the gate. `prepare`'s refusal off main just fails early.
- **A reusable workflow gets no more permission than the job that calls it.** In `release.yml`, the `prerelease` job has to grant `contents: write`, `id-token: write` and `attestations: write` (the last two are for build provenance). Jobs inside the called workflow can only narrow that.
- **The first stable release has no earlier stable tag.** 0.1.0 was never tagged, so `previous_tag_name` is left out and GitHub picks where the generated list of changes starts. Check the first release's notes.

## Related

- [security-hardening.md](security-hardening.md): the plugin's own threat model.
- [dev-workflow.md](dev-workflow.md): build and test commands.
