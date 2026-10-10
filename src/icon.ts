import { addIcon } from "obsidian";

export const LODESTONE_ICON = "lodestone";

/**
 * Pixel-art lodestone: a chiseled stone block with a carved compass rose, on a 12×12 grid
 * (8 units per pixel, 100×100 viewBox). Filled with currentColor, so it works on any background.
 *
 *   ############
 *   #..........#
 *   #.########.#
 *   #.###..###.#
 *   #.##.##.##.#
 *   #.#.####.#.#
 *   #.#.####.#.#
 *   #.##.##.##.#
 *   #.###..###.#
 *   #.########.#
 *   #..........#
 *   ############
 */
const LODESTONE_SVG = `<path fill="currentColor" d="
M2 2h96v8h-96z
M2 10h8v8h-8zM90 10h8v8h-8z
M2 18h8v8h-8zM18 18h64v8h-64zM90 18h8v8h-8z
M2 26h8v8h-8zM18 26h24v8h-24zM58 26h24v8h-24zM90 26h8v8h-8z
M2 34h8v8h-8zM18 34h16v8h-16zM42 34h16v8h-16zM66 34h16v8h-16zM90 34h8v8h-8z
M2 42h8v8h-8zM18 42h8v8h-8zM34 42h32v8h-32zM74 42h8v8h-8zM90 42h8v8h-8z
M2 50h8v8h-8zM18 50h8v8h-8zM34 50h32v8h-32zM74 50h8v8h-8zM90 50h8v8h-8z
M2 58h8v8h-8zM18 58h16v8h-16zM42 58h16v8h-16zM66 58h16v8h-16zM90 58h8v8h-8z
M2 66h8v8h-8zM18 66h24v8h-24zM58 66h24v8h-24zM90 66h8v8h-8z
M2 74h8v8h-8zM18 74h64v8h-64zM90 74h8v8h-8z
M2 82h8v8h-8zM90 82h8v8h-8z
M2 90h96v8h-96z
"/>`;

export function registerIcons() {
	addIcon(LODESTONE_ICON, LODESTONE_SVG);
}
