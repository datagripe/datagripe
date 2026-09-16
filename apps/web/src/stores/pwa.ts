import { create } from "zustand";

/**
 * PWA update state. pwa.ts (service-worker registration) flips
 * `updateAvailable` when a new build's service worker is waiting;
 * `applyUpdate` tells that worker to activate and reloads onto it.
 *
 * `checkForNewBuild` exists because a reload is not a way out of a
 * stale bundle. A service worker serves its precache, so
 * `location.reload()` re-renders exactly the build you were trying to
 * leave — the page has to ask for a new worker, wait for it to install,
 * and then activate it. Anything that knows the page is behind (a
 * restart it just asked for, a server whose version no longer matches)
 * calls this rather than reloading and hoping.
 */
interface PwaState {
	updateAvailable: boolean;
	applyUpdate: (() => void) | null;
	/**
	 * Ask the browser for a new service worker now, and resolve true when
	 * one is waiting to take over. False means none is coming — no
	 * registration, no new build, or it did not finish installing in
	 * time — and the caller should fall back to an ordinary reload.
	 */
	checkForNewBuild: (() => Promise<boolean>) | null;
}

export const usePwaStore = create<PwaState>(() => ({
	updateAvailable: false,
	applyUpdate: null,
	checkForNewBuild: null,
}));
