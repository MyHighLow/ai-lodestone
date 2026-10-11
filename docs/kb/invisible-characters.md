---
title: Invisible and text-direction characters
tags: [prompt-blocks, sanitizing, security, unicode]
updated: 2026-10-11
---

# Invisible and text-direction characters

A note can contain characters that render as nothing or reorder the text around them. Without filtering, a prompt block could read differently from what is sent, or smuggle hidden text to the model. `stripInvisible` in `src/sanitize.ts` removes them.

## What is removed

- Everything Unicode marks `Default_Ignorable_Code_Point`: zero-width spaces and joiners, bidi controls, variation selectors, tag characters, Hangul fillers, the soft hyphen, and so on.
- The interlinear annotation controls U+FFF9–U+FFFB.
- C0 and C1 control characters except tab, line feed and carriage return. A NUL would also cut the prompt short on Windows, where a command line ends at the first NUL.

## What is kept, and only where it's needed

- ZWJ and ZWNJ between two letters or emoji parts. Emoji sequences and Persian and Indic scripts need them.
- One FE0E/FE0F presentation selector directly after an emoji.
- The three standard subdivision flags (England, Scotland, Wales). Any other tag sequence is removed, because tag characters after 🏴 can spell out arbitrary hidden ASCII.

A run of joiners or selectors fails these checks after its first character, so it can't carry a hidden binary payload.

## Where it's applied

- **After** placeholder expansion: a file name can carry hidden characters too. The prompt-block preview shows the expanded, stripped text, which is exactly what Run sends.
- In `newSessionArgs` for every launch, as a last line of defense whatever built the prompt.
- To block titles, session names (`sessionNameArg`, since hidden characters could spoof names in claude's `/resume` list) and window titles (`consoleTitle`).

The prompt card says how many characters were removed.

## Related: long prompts must be read first

A prompt longer than 400 characters or 8 lines starts collapsed. The first Run or Copy click expands it, and only the next click acts. This is remembered per note and prompt text for the Obsidian session (`reviewedPrompts` in `main.ts`), so re-rendering after a Run doesn't ask again.
