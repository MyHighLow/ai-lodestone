// Characters that render as nothing (or reorder the text around them), so a note can make
// a prompt read differently from what's actually sent, or smuggle hidden text to the model.
// Pure, so it can be unit tested.

/**
 * Candidates: everything Unicode marks Default_Ignorable_Code_Point (zero-width spaces and
 * joiners, bidi controls, variation selectors, tag characters, Hangul fillers, soft hyphen…),
 * plus the interlinear annotation controls U+FFF9–FFFB.
 *
 * Matched first, and kept whole: the three standard subdivision flags (England, Scotland,
 * Wales), whose tag characters spell gbeng/gbsct/gbwls. Any other tag sequence is stripped,
 * because tags after 🏴 can spell out arbitrary hidden ASCII.
 */
const CANDIDATES =
	/\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}|[\p{Default_Ignorable_Code_Point}\uFFF9-\uFFFB]/gu;

/** What may sit on either side of a kept ZWJ/ZWNJ: letters, marks, emoji parts. */
const JOINABLE = /[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F]/u;
const EMOJI = /\p{Emoji}/u;

function codePointBefore(s: string, i: number): string {
	return i <= 0 ? "" : Array.from(s.slice(Math.max(0, i - 2), i)).pop() ?? "";
}

function codePointAfter(s: string, i: number): string {
	const cp = s.codePointAt(i);
	return cp === undefined ? "" : String.fromCodePoint(cp);
}

/**
 * Keeps the few invisible characters real text needs, only where it needs them:
 * - ZWJ/ZWNJ between two letters or emoji (emoji sequences, Persian and Indic scripts)
 * - one FE0E/FE0F presentation selector directly after an emoji
 * A run of joiners or selectors fails these tests past its first character, so it can't
 * carry a hidden binary payload.
 */
function keep(match: string, offset: number, s: string): boolean {
	if (match.codePointAt(0) === 0x1f3f4) return true;
	const before = codePointBefore(s, offset);
	if (match === "\u200C" || match === "\u200D") {
		return JOINABLE.test(before) && JOINABLE.test(codePointAfter(s, offset + match.length));
	}
	if (match === "\uFE0E" || match === "\uFE0F") return EMOJI.test(before);
	return false;
}

export function stripInvisible(text: string): { text: string; removed: number } {
	let removed = 0;
	const out = text.replace(CANDIDATES, (match: string, offset: number, s: string) => {
		if (keep(match, offset, s)) return match;
		removed++;
		return "";
	});
	return { text: out, removed };
}
