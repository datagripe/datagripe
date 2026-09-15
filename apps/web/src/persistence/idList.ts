/**
 * A list of ids in localStorage — which sidebar sections are open,
 * which file tree roots are. Shared because two components keeping the
 * same shape in two slightly different ways is how one of them ends up
 * silently discarding the other's key on a parse it did not expect.
 *
 * Every failure is swallowed: storage can be blocked, and a browser
 * that will not remember which sections were open is not a browser that
 * should refuse to render the sidebar.
 */

export function readIds(key: string): string[] {
	try {
		const raw = localStorage.getItem(key);
		const parsed: unknown = raw === null ? [] : JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((value) => typeof value === "string")
			: [];
	} catch {
		return [];
	}
}

export function writeIds(key: string, ids: string[]): void {
	try {
		localStorage.setItem(key, JSON.stringify(ids));
	} catch {
		// Storage blocked — the state holds for this session and no longer.
	}
}

/** In the list or out of it, and the list back. */
export function toggleId(ids: string[], id: string): string[] {
	return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}
