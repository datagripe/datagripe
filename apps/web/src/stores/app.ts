import type { AppVersion, UpdateCheck } from "@datagripe/contracts";
import { create } from "zustand";
import { wsClient } from "../api/ws";

/**
 * What the account menu knows about the running application
 * (docs/spec/updates.md): the two versions, the deployment's shape, and
 * the answer to the update button when somebody presses it.
 *
 * Nothing here polls and nothing checks on a timer. `version` is asked
 * for when the menu is first opened — it is three static fields — and
 * the release feed is reached only when a person asks it to be.
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
	checkForUpdate: () => Promise<void>;
	restart: () => Promise<void>;
	reset: () => void;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong";
}

/** How long to keep knocking before admitting it did not come back. */
const RESTART_WAIT_MS = 120_000;
const RESTART_POLL_MS = 1_000;

/**
 * Wait for the server to answer again, then reload onto whatever it is
 * now serving. A restart that pulled a new image also replaced the
 * bundle, so staying on the old one is the one outcome nobody wanted.
 */
async function reloadWhenBack(): Promise<void> {
	const deadline = Date.now() + RESTART_WAIT_MS;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, RESTART_POLL_MS));
		try {
			const response = await fetch("/health", { cache: "no-store" });
			if (response.ok) {
				window.location.reload();
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

	reset() {
		set({ version: null, update: null, error: null, checking: false });
	},
}));
