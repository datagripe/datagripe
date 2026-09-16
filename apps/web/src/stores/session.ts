import type {
	Capability,
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
import { forgetWorkspace } from "../persistence/db";
import { useBrandingStore } from "./branding";

/**
 * Session state: the /api/session bootstrap plus login/signup/logout,
 * and the current workspace (the project unit). Workspace switching
 * reconnects the socket and rescopes every workspace-bound store.
 */

const WORKSPACE_STORAGE_KEY = "dg.currentWorkspace";

export interface CurrentWorkspace {
	id: string;
	name: string;
	/** The role's name — a built-in's, or one this project made. */
	role: string;
	/** What that role may do here (docs/spec/permissions.md). */
	capabilities: Capability[];
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
	/** Delete the open project and move to another one. */
	deleteWorkspace: (id: string) => Promise<void>;
	/**
	 * The open project is gone — deleted here, or by somebody else while
	 * this session had it open.
	 */
	workspaceDeleted: (id: string) => Promise<void>;
	confirmWorkspace: (workspace: CurrentWorkspace) => void;
	/** A role changed under this session (docs/spec/permissions.md). */
	applyPermissions: (next: {
		role: string;
		capabilities: Capability[];
	}) => void;
	login: (email: string, password: string) => Promise<boolean>;
	signup: (email: string, password: string) => Promise<boolean>;
	/** Usernameless: the key names the account (docs/spec/auth-and-hardening.md). */
	loginWithPasskey: () => Promise<boolean>;
	/** Create an account whose only credential is a security key. */
	signupWithPasskey: (email: string) => Promise<boolean>;
	logout: () => Promise<void>;
	/**
	 * What to be called. An account field rather than a browser one: the
	 * online list and anything else that names a person has to be able to
	 * read it, and only the server can tell everybody
	 * (docs/spec/updates.md "The account menu").
	 */
	setName: (name: string) => Promise<void>;
};

/** WebAuthn needs a secure context, so it is absent over plain http to
 * anything but localhost. */
export const webAuthnAvailable = browserSupportsWebAuthn();

/**
 * A provider sign-in that failed comes back as a redirect, not a fetch,
 * so its message arrives in the query string. Read — and scrubbed from
 * the address bar — once, when this module first loads.
 */
function takeRedirectAuthError(): string | null {
	// Imported by tests that run without a DOM.
	if (typeof window === "undefined") {
		return null;
	}
	const params = new URLSearchParams(window.location.search);
	const message = params.get("auth_error");
	if (message === null) {
		return null;
	}
	params.delete("auth_error");
	const query = params.toString();
	window.history.replaceState(
		null,
		"",
		`${window.location.pathname}${query === "" ? "" : `?${query}`}${window.location.hash}`,
	);
	return message;
}

export const redirectAuthError = takeRedirectAuthError();

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

	applyPermissions(next) {
		const current = get().currentWorkspace;
		if (current === null) {
			return;
		}
		set({
			currentWorkspace: {
				...current,
				role: next.role,
				capabilities: next.capabilities,
			},
		});
	},

	async setName(name) {
		const trimmed = name.trim();
		const { name: saved } = await wsClient.request<{ name: string | null }>(
			"account.set-name",
			{ name: trimmed === "" ? null : trimmed },
		);
		const bootstrap = get().bootstrap;
		if (bootstrap?.user != null) {
			set({
				bootstrap: {
					...bootstrap,
					user: { ...bootstrap.user, name: saved },
				},
			});
		}
	},

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
							capabilities: bootstrap.workspace.capabilities,
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

	async deleteWorkspace(id) {
		await wsClient.request("workspace.delete", { id });
		// The server broadcasts workspace.deleted to every socket in the
		// project, including this one, so the local move happens once,
		// there — deleting and being told are the same situation.
	},

	async workspaceDeleted(id) {
		const remaining = get().workspaces.filter((entry) => entry.id !== id);
		set({ workspaces: remaining });
		// What this browser cached for a project that no longer exists:
		// its class, its dock layout, its shared files. Files on the host
		// are the host's and are left where they are.
		useBrandingStore.getState().forget(id);
		await forgetWorkspace(id);
		if (get().currentWorkspaceId !== id) {
			return;
		}
		const next = remaining[0];
		if (next === undefined) {
			// The server refuses to leave anybody without a project, so this
			// is a list that was already stale — reconnecting resolves the
			// account's default rather than guessing one here.
			localStorage.removeItem(WORKSPACE_STORAGE_KEY);
			set({ currentWorkspaceId: null, currentWorkspace: null });
			return;
		}
		get().switchWorkspace(next.id);
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

/**
 * Whether the signed-in member may do a thing here.
 *
 * Not a hook, so it can be called from an event handler or a store as
 * easily as from a render — and the answer is only ever advisory. The
 * server checks the same capability on every message; this is what
 * stops the interface offering a button that would be refused.
 */
export function can(capability: Capability): boolean {
	return (
		useSessionStore
			.getState()
			.currentWorkspace?.capabilities.includes(capability) ?? false
	);
}

/** The same question, as a subscription, for a component that renders on it. */
export function useCan(capability: Capability): boolean {
	return useSessionStore(
		(state) =>
			state.currentWorkspace?.capabilities.includes(capability) ?? false,
	);
}
