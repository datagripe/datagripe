/**
 * The avatar in the account menu.
 *
 * Gravatar takes a hash of the address rather than the address, and
 * accepts SHA-256 as well as its original MD5 — so this uses the hash
 * the platform already has (`crypto.subtle`) and ships no digest of its
 * own. It is still a request to a third party from a self-hosted
 * application, so two things are true by construction: nothing is sent
 * until the menu is opened for the first time, and `d=404` means an
 * address with no avatar gets no generated image back. The initials
 * below are what a reader sees in that case, offline, or on any
 * deployment that cannot reach the internet.
 */

/** Small, because it is drawn at 22px and retina doubles it. */
const SIZE = 64;

export async function gravatarUrl(email: string): Promise<string | null> {
	const normalised = email.trim().toLowerCase();
	if (normalised === "" || globalThis.crypto?.subtle === undefined) {
		return null;
	}
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(normalised),
	);
	const hash = [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	return `https://gravatar.com/avatar/${hash}?s=${SIZE}&d=404`;
}

/** One or two letters, from whatever the address gives us. */
export function initials(email: string): string {
	const local = email.split("@")[0] ?? email;
	const parts = local.split(/[._-]+/).filter((part) => part.length > 0);
	const letters =
		parts.length > 1
			? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
			: (local.slice(0, 2) ?? "");
	return letters.toUpperCase() || "?";
}

/**
 * A stable colour per address, from the same eight-slot palette the
 * domain rail uses — never a project accent, because a face is not a
 * warning.
 */
export function avatarSlot(email: string): number {
	let hash = 0;
	for (const char of email) {
		hash = (hash * 31 + char.charCodeAt(0)) % 997;
	}
	return (hash % 8) + 1;
}
