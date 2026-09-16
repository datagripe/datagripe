import type { AppVersion, UpdateCheck } from "@datagripe/contracts";
import { create } from "zustand";
import { wsClient } from "../api/ws";
import { usePwaStore } from "./pwa";

/**
 * What the account menu knows about the running application
 * (docs/spec/updates.md): the two versions, the deployment's shape, and
 * the answer to the update button when somebody presses it.
 *
 * Nothing here polls. The release feed is reached exactly once per
 * workspace open, because the status bar's job is to say whether this
 * deployment is behind and a badge that only lights up after somebody
 * presses a button is a badge nobody sees. The server caches the answer
 * for ten minutes, so a room full of people is still one request, and
 * `UPDATE_CHECK_DISABLED` skips it entirely.
 */

/** The bundle's version, substituted at build time (vite.config.ts). */
export const UI_VERSION = __UI_VERSION__;

export interface AppState {
	version: AppVersion | null;
	update: UpdateCheck | null;
	checking: boolean;
	/** Set while the server is going away and we are waiting for it back. */
	restarting: boolean;
	error: string | null;
	loadVersion: () => Promise<void>;
	/** Both, on workspace open: the status bar needs the verdict, not the
	 * version alone. Skips the network half when the deployment says no. */
	loadVersionAndUpdate: () => Promise<void>;
	checkForUpdate: () => Promise<void>;
	restart: () => Promise<void>;
	/**
	 * Leave a stale bundle behind: ask for the new service worker, hand
	 * over to it, and fall back to a reload when there is none. What the
	 * "refresh" in the version popup does, and what a restart does for
	 * itself once the server answers again.
	 */
	refreshOntoLatest: () => Promise<void>;
	reset: () => void;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong";
}

/** How long to keep knocking before admitting it did not come back. */
const RESTART_WAIT_MS = 120_000;
const RESTART_POLL_MS = 1_000;

/**
 * Onto whatever the server is serving now.
 *
 * **Not `location.reload()`.** A service worker answers from its
 * precache, so a reload re-renders the build you are trying to leave —
 * which is how a page ends up saying "this page is running an older
 * build than the server" after every refresh, for ever. The page has to
 * ask for a new worker, wait for it to install, and hand over to it.
 * With no worker registered, a reload is the whole job.
 */
async function refreshOntoLatest(): Promise<void> {
	const { checkForNewBuild, applyUpdate } = usePwaStore.getState();
	if (checkForNewBuild !== null && applyUpdate !== null) {
		const waiting = await checkForNewBuild().catch(() => false);
		if (waiting) {
			// Activates the new worker and reloads onto it.
			applyUpdate();
			return;
		}
	}
	window.location.reload();
}

/**
 * Wait for the server to answer again, then move onto what it is now
 * serving. A restart that pulled a new image also replaced the bundle,
 * so staying on the old one is the one outcome nobody wanted — and the
 * one that happens by default, because the cache in front of the page
 * survives the server it came from.
 */
async function reloadWhenBack(): Promise<void> {
	const deadline = Date.now() + RESTART_WAIT_MS;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, RESTART_POLL_MS));
		try {
			const response = await fetch("/health", { cache: "no-store" });
			if (response.ok) {
				await refreshOntoLatest();
				return;
			}
		} catch {
			// Still down, which is the expected half of a restart.
		}
	}
	useAppStore.setState({
		restarting: false,
		error:
			"DataGripe has not come back. Check the deployment — nothing here can start it.",
	});
}

export const useAppStore = create<AppState>()((set, get) => ({
	version: null,
	update: null,
	checking: false,
	restarting: false,
	error: null,

	async loadVersion() {
		if (get().version !== null) {
			return;
		}
		try {
			set({ version: await wsClient.request<AppVersion>("app.version", {}) });
		} catch (error) {
			set({ error: message(error) });
		}
	},

	async loadVersionAndUpdate() {
		await get().loadVersion();
		if (get().version?.updateCheck === true) {
			await get().checkForUpdate();
		}
	},

	async checkForUpdate() {
		set({ checking: true, error: null });
		try {
			set({
				update: await wsClient.request<UpdateCheck>("app.update.check", {}),
			});
		} catch (error) {
			set({ error: message(error) });
		} finally {
			set({ checking: false });
		}
	},

	async restart() {
		set({ restarting: true, error: null });
		try {
			await wsClient.request("app.restart", {});
			void reloadWhenBack();
		} catch (error) {
			set({ restarting: false, error: message(error) });
		}
	},

	refreshOntoLatest,

	reset() {
		set({ version: null, update: null, error: null, checking: false });
	},
}));
