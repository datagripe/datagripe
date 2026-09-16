import type {
	McpMode,
	McpState,
	McpStatus,
	McpTokenCreateResult,
} from "@datagripe/contracts";
import { create } from "zustand";
import { wsClient } from "../api/ws";

/**
 * The mcp panel's state (docs/spec/mcp.md "The panel").
 *
 * Two reads, because the section header outlives the panel. `status` is
 * the settings row — on or off, and which mode — and the header asks
 * for it on every project open, since a switch that lets something
 * outside the app read the project has to be visible without opening
 * anything. `state` is everything else, and it walks the datasource
 * paths to count the files an agent would see: a disk read nobody asked
 * for while the section sits collapsed, so it waits until it is opened.
 *
 * `revealed` is the one piece of state that only exists in memory. A
 * token value is shown once, at creation; there is no second chance to
 * copy it because there is nowhere it was kept.
 */

export interface McpUiState {
	/** Null until the header has asked; absent deployments answer too. */
	status: McpStatus | null;
	state: McpState | null;
	loading: boolean;
	busy: boolean;
	error: string | null;
	/** The token created in this session, for as long as the panel is open. */
	revealed: { id: string; name: string; value: string } | null;
	loadStatus: () => Promise<void>;
	load: () => Promise<void>;
	setSettings: (settings: { enabled: boolean; mode: McpMode }) => Promise<void>;
	createToken: (name: string) => Promise<void>;
	revokeToken: (id: string) => Promise<void>;
	dismissRevealed: () => void;
	reset: () => void;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong";
}

/** The header's three fields, out of the panel's whole read. */
function statusOf(state: McpState): McpStatus {
	return {
		available: state.available,
		enabled: state.enabled,
		mode: state.mode,
		tokenCount: state.tokens.length,
	};
}

export const useMcpStore = create<McpUiState>()((set, get) => ({
	status: null,
	state: null,
	loading: false,
	busy: false,
	error: null,
	revealed: null,

	async loadStatus() {
		try {
			set({ status: await wsClient.request<McpStatus>("mcp.status", {}) });
		} catch {
			// A viewer, or a deployment without MCP: either way the header
			// shows nothing, which is what an unanswered status means.
			set({ status: null });
		}
	},

	async load() {
		if (get().loading) {
			return;
		}
		set({ loading: true });
		try {
			const state = await wsClient.request<McpState>("mcp.settings", {});
			set({ state, status: statusOf(state), error: null });
		} catch (error) {
			set({ error: message(error) });
		} finally {
			set({ loading: false });
		}
	},

	async setSettings(settings) {
		set({ busy: true });
		try {
			const state = await wsClient.request<McpState>(
				"mcp.settings.set",
				settings,
			);
			set({ state, status: statusOf(state), error: null });
		} catch (error) {
			set({ error: message(error) });
		} finally {
			set({ busy: false });
		}
	},

	async createToken(name) {
		set({ busy: true });
		try {
			const result = await wsClient.request<McpTokenCreateResult>(
				"mcp.token.create",
				{ name },
			);
			set({
				state: result.state,
				status: statusOf(result.state),
				revealed: {
					id: result.token.id,
					name: result.token.name,
					value: result.value,
				},
				error: null,
			});
		} catch (error) {
			set({ error: message(error) });
		} finally {
			set({ busy: false });
		}
	},

	async revokeToken(id) {
		set({ busy: true });
		try {
			const state = await wsClient.request<McpState>("mcp.token.revoke", {
				id,
			});
			const revealed = get().revealed;
			set({
				state,
				status: statusOf(state),
				error: null,
				revealed: revealed?.id === id ? null : revealed,
			});
		} catch (error) {
			set({ error: message(error) });
		} finally {
			set({ busy: false });
		}
	},

	dismissRevealed() {
		set({ revealed: null });
	},

	reset() {
		set({
			status: null,
			state: null,
			error: null,
			revealed: null,
			busy: false,
		});
	},
}));
