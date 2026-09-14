import type {
	SessionBootstrap,
	WorkspaceListEntry,
	WorkspaceListResult,
} from "@datagripe/contracts";
import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";
import { create } from "zustand";
import { wsClient } from "../api/ws";

/**
 * Session state: the /api/session bootstrap plus login/signup/logout,
 * and the current workspace (the project unit). Workspace switching
 * reconnects the socket and rescopes every workspace-bound store.
 */

const WORKSPACE_STORAGE_KEY = "dg.currentWorkspace";

export interface CurrentWorkspace {
	id: string;
	name: string;
	role: "owner" | "editor" | "viewer";
	defaultConnectionRef: string | null;
}

export type SessionState = {
	bootstrap: SessionBootstrap | null;
	/** Workspace the socket is bound to (defaults to the account's first). */
	currentWorkspaceId: string | null;
	/** Bound workspace details, refreshed on every workspace.open. */
	currentWorkspace: CurrentWorkspace | null;
	/** All workspaces the account belongs to (switcher list). */
	workspaces: WorkspaceListEntry[];
	error: string | null;
	busy: boolean;
	load: () => Promise<void>;
	loadWorkspaces: () => Promise<void>;
	switchWorkspace: (id: string) => void;
	createWorkspace: (name: string) => Promise<WorkspaceListEntry>;
	renameWorkspace: (name: string) => Promise<void>;
	confirmWorkspace: (workspace: CurrentWorkspace) => void;
	login: (email: string, password: string) => Promise<boolean>;
	signup: (email: string, password: string) => Promise<boolean>;
	/** Usernameless: the key names the account (docs/spec/auth-and-hardening.md). */
	loginWithPasskey: () => Promise<boolean>;
	/** Create an account whose only credential is a security key. */
	signupWithPasskey: (email: string) => Promise<boolean>;
	logout: () => Promise<void>;
};

/** WebAuthn needs a secure context, so it is absent over plain http to
 * anything but localhost. */
export const webAuthnAvailable = browserSupportsWebAuthn();

async function errorMessage(res: Response, fallback: string): Promise<string> {
	try {
		const body = (await res.json()) as { error?: { message?: string } };
		return body.error?.message ?? fallback;
	} catch {
		return fallback;
	}
}

/**
 * What went wrong at the authenticator. The browser throws
 * `NotAllowedError` both for "you cancelled" and "you waited too long",
 * and there is nothing to add to either.
 */
export function ceremonyError(error: unknown, fallback: string): string | null {
	if (error instanceof Error) {
		if (error.name === "NotAllowedError" || error.name === "AbortError") {
			return null;
		}
		if (error.name === "InvalidStateError") {
			return "That key is already registered on this account.";
		}
		return error.message;
	}
	return fallback;
}

async function post(
	path: string,
	body: unknown,
	csrfToken?: string,
): Promise<Response> {
	return fetch(path, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(csrfToken !== undefined ? { "x-csrf-token": csrfToken } : {}),
		},
		body: JSON.stringify(body),
	});
}

export const useSessionStore = create<SessionState>()((set, get) => ({
	bootstrap: null,
	currentWorkspaceId: null,
	currentWorkspace: null,
	workspaces: [],
	error: null,
	busy: false,

	async load() {
		const res = await fetch("/api/session");
		const bootstrap = (await res.json()) as SessionBootstrap;
		const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY);
		set({
			bootstrap,
			currentWorkspaceId: saved ?? bootstrap.workspace?.id ?? null,
			// Until the socket's first workspace.open confirms the binding,
			// show the bootstrap default.
			currentWorkspace:
				get().currentWorkspace ??
				(bootstrap.workspace !== null
					? {
							id: bootstrap.workspace.id,
							name: bootstrap.workspace.name,
							role: bootstrap.workspace.role,
							defaultConnectionRef: bootstrap.workspace.defaultConnectionRef,
						}
					: null),
		});
	},

	async loadWorkspaces() {
		const result = await wsClient.request<WorkspaceListResult>(
			"workspace.list",
			{},
		);
		set({ workspaces: result.workspaces });
	},

	switchWorkspace(id) {
		if (id === get().currentWorkspaceId) {
			return;
		}
		localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
		set({ currentWorkspaceId: id, currentWorkspace: null });
		wsClient.setWorkspace(id);
	},

	async createWorkspace(name) {
		const result = await wsClient.request<{ workspace: WorkspaceListEntry }>(
			"workspace.create",
			{ name },
		);
		await get().loadWorkspaces();
		get().switchWorkspace(result.workspace.id);
		return result.workspace;
	},

	async renameWorkspace(name) {
		const result = await wsClient.request<{
			workspace: { id: string; name: string };
		}>("workspace.rename", { name });
		const current = get().currentWorkspace;
		if (current !== null && current.id === result.workspace.id) {
			set({ currentWorkspace: { ...current, name: result.workspace.name } });
		}
		set({
			workspaces: get().workspaces.map((entry) =>
				entry.id === result.workspace.id
					? { ...entry, name: result.workspace.name }
					: entry,
			),
		});
	},

	/** Called with every workspace.open result: confirms the actual bound
	 * workspace (the server falls back to the default for stale ids). */
	confirmWorkspace(workspace: CurrentWorkspace) {
		localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace.id);
		set({ currentWorkspaceId: workspace.id, currentWorkspace: workspace });
	},

	async login(email, password) {
		set({ busy: true, error: null });
		try {
			const res = await post("/api/auth/login", { email, password });
			if (!res.ok) {
				set({ error: await errorMessage(res, "Login failed") });
				return false;
			}
			await get().load();
			return true;
		} finally {
			set({ busy: false });
		}
	},

	async signup(email, password) {
		set({ busy: true, error: null });
		try {
			const res = await post("/api/auth/signup", { email, password });
			if (!res.ok) {
				set({ error: await errorMessage(res, "Signup failed") });
				return false;
			}
			await get().load();
			return true;
		} finally {
			set({ busy: false });
		}
	},

	async loginWithPasskey() {
		set({ busy: true, error: null });
		try {
			const optionsRes = await post("/api/auth/passkey/login/options", {});
			if (!optionsRes.ok) {
				set({ error: await errorMessage(optionsRes, "Sign in failed") });
				return false;
			}
			const optionsJSON = await optionsRes.json();
			let response: unknown;
			try {
				response = await startAuthentication({ optionsJSON });
			} catch (err) {
				set({ error: ceremonyError(err, "Sign in failed") });
				return false;
			}
			const res = await post("/api/auth/passkey/login/verify", { response });
			if (!res.ok) {
				set({ error: await errorMessage(res, "Sign in failed") });
				return false;
			}
			await get().load();
			return true;
		} finally {
			set({ busy: false });
		}
	},

	async signupWithPasskey(email) {
		set({ busy: true, error: null });
		try {
			const optionsRes = await post("/api/auth/passkey/register/options", {
				email,
			});
			if (!optionsRes.ok) {
				set({ error: await errorMessage(optionsRes, "Signup failed") });
				return false;
			}
			const optionsJSON = await optionsRes.json();
			let response: unknown;
			try {
				response = await startRegistration({ optionsJSON });
			} catch (err) {
				set({ error: ceremonyError(err, "Signup failed") });
				return false;
			}
			const res = await post("/api/auth/passkey/register/verify", { response });
			if (!res.ok) {
				set({ error: await errorMessage(res, "Signup failed") });
				return false;
			}
			await get().load();
			return true;
		} finally {
			set({ busy: false });
		}
	},

	async logout() {
		const csrfToken = get().bootstrap?.csrfToken ?? undefined;
		await post("/api/auth/logout", {}, csrfToken).catch(() => {});
		wsClient.disconnect();
		set({ bootstrap: null, error: null });
		await get().load();
	},
}));
