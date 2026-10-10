export function relativeTime(iso: string | undefined): string {
	if (!iso) return "";
	const t = new Date(iso).getTime();
	if (isNaN(t)) return iso;
	const s = Math.round((Date.now() - t) / 1000);
	if (s < 60) return "just now";
	const units: [number, string][] = [
		[60, "minute"],
		[60, "hour"],
		[24, "day"],
		[7, "week"],
		[4.35, "month"],
		[12, "year"],
	];
	let n = s / 60;
	let unit = "minute";
	for (let i = 1; i < units.length && n >= units[i][0]; i++) {
		n /= units[i][0];
		unit = units[i][1];
	}
	const r = Math.floor(n);
	return `${r} ${unit}${r === 1 ? "" : "s"} ago`;
}

export function truncate(s: string, max: number): string {
	const one = s.replace(/\s+/g, " ").trim();
	return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

/** /mnt/d/a/b → D:\a\b; returns null for paths outside the Windows mounts. */
export function wslToWindows(p: string, mountRoot = "/mnt"): string | null {
	const root = mountRoot.replace(/\/+$/, "");
	const m = new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([a-z])(/.*)?$`, "i").exec(p);
	if (!m) return null;
	return `${m[1].toUpperCase()}:${(m[2] ?? "/").replace(/\//g, "\\")}`;
}
