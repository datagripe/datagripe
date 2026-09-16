import type { Passkey, PasskeyListResult } from "@datagripe/contracts";
import { DISPLAY_NAME_MAX } from "@datagripe/contracts";
import { startRegistration } from "@simplewebauthn/browser";
import { useCallback, useEffect, useState } from "react";
import {
	SCALE_DEFAULT,
	SCALE_MAX,
	SCALE_MIN,
	SCALE_STEP,
	useAppearanceStore,
} from "../stores/appearance";
import {
	ceremonyError,
	useSessionStore,
	webAuthnAvailable,
} from "../stores/session";
import { TextInput } from "./controls";
import { IconClose } from "./icons";

/**
 * Account settings tab (header email): the security keys this account
 * signs in with (docs/spec/auth-and-hardening.md "Security keys"). One
 * account may hold as many keys as it likes — a spare in a drawer is the
 * whole point — and the server refuses to remove the last way in.
 *
 * And the size of the interface, which is not an account setting at all
 * (docs/spec/editor-workspace.md "Scale"): it lives in this browser's
 * localStorage, because the reason to turn it up is the screen in front
 * of you and the same account is also open on a phone.
 */

async function post(path: string, body: unknown, csrfToken: string) {
	return fetch(path, {
		method: "POST",
		headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
		body: JSON.stringify(body),
	});
}

async function messageOf(res: Response, fallback: string): Promise<string> {
	try {
		const body = (await res.json()) as { error?: { message?: string } };
		return body.error?.message ?? fallback;
	} catch {
		return fallback;
	}
}

function describe(passkey: Passkey): string {
	const used =
		passkey.lastUsedAt === null
			? "never used"
			: `last used ${new Date(passkey.lastUsedAt).toLocaleDateString()}`;
	return `added ${new Date(passkey.createdAt).toLocaleDateString()} · ${used}`;
}

/**
 * What to be called.
 *
 * An account field, not a browser one: the online list names other
 * people with it, and only the server can tell everybody
 * (docs/spec/updates.md "The account menu"). The address stays the
 * identity — this is a label, it is not unique, and nothing looks
 * anybody up by it.
 */
function Name() {
	const saved = useSessionStore((state) => state.bootstrap?.user?.name ?? "");
	const [draft, setDraft] = useState(saved);
	const [error, setError] = useState<string | null>(null);

	// Follow the account when something else changes it — a second tab,
	// or a reconnect — but never mid-edit.
	const [lastSaved, setLastSaved] = useState(saved);
	if (saved !== lastSaved) {
		setLastSaved(saved);
		setDraft(saved);
	}

	/** On blur rather than per keystroke: this is a round trip and a
	 * broadcast to everybody in the project. */
	const commit = () => {
		if (draft.trim() === saved) {
			return;
		}
		setError(null);
		void useSessionStore
			.getState()
			.setName(draft)
			.catch(() => setError("Could not save that name."));
	};

	return (
		<div className="dg-form-section">
			<span className="dg-form-section-title">Name</span>
			<p className="dg-form-note">
				What to call you: shown in the header button instead of the initials
				taken from your address, and in the online list to everybody else in the
				project. Your address stays your account.
			</p>
			<TextInput
				className="dg-name-input"
				type="text"
				value={draft}
				maxLength={DISPLAY_NAME_MAX}
				placeholder="Your name"
				aria-label="Your name"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.currentTarget.blur();
					}
				}}
			/>
			{error !== null && <p className="dg-test-failed">{error}</p>}
		</div>
	);
}

/**
 * The scale slider. Shown whatever the server's auth settings are —
 * a deployment with accounts off still has readers with eyes.
 */
function Appearance() {
	const scale = useAppearanceStore((state) => state.scale);
	const setScale = useAppearanceStore((state) => state.setScale);
	const percent = Math.round(scale * 100);

	return (
		<div className="dg-form-section">
			<span className="dg-form-section-title">Appearance</span>
			<p className="dg-form-note">
				How big the interface is. Every size in the application is a multiple of
				this one, so the tree, the tabs, the editor and the results move
				together. Stored in this browser, not in your account.
			</p>
			<div className="dg-scale-row">
				<span className="dg-scale-sample dg-scale-sample-small">A</span>
				<input
					type="range"
					className="dg-scale-slider"
					min={SCALE_MIN}
					max={SCALE_MAX}
					step={SCALE_STEP}
					value={scale}
					aria-label="Interface scale"
					aria-valuetext={`${percent} percent`}
					onChange={(event) => setScale(event.target.valueAsNumber)}
				/>
				<span className="dg-scale-sample">A</span>
				<output className="dg-scale-value">{percent}%</output>
				<button
					type="button"
					className="dg-doc-new"
					disabled={scale === SCALE_DEFAULT}
					onClick={() => setScale(SCALE_DEFAULT)}
				>
					reset
				</button>
			</div>
		</div>
	);
}

export function AccountSettingsPanel() {
	const user = useSessionStore((state) => state.bootstrap?.user ?? null);
	const csrfToken = useSessionStore(
		(state) => state.bootstrap?.csrfToken ?? "",
	);
	const passkeysEnabled = useSessionStore(
		(state) => state.bootstrap?.passkeysEnabled ?? false,
	);
	const authDisabled = useSessionStore(
		(state) => state.bootstrap?.authDisabled ?? false,
	);

	const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
	const [hasPassword, setHasPassword] = useState(true);
	const [hasGoogle, setHasGoogle] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const reload = useCallback(async () => {
		const res = await fetch("/api/auth/passkeys");
		if (!res.ok) {
			setError(await messageOf(res, "Could not load your security keys"));
			return;
		}
		const result = (await res.json()) as PasskeyListResult;
		setPasskeys(result.passkeys);
		setHasPassword(result.hasPassword);
		setHasGoogle(result.hasGoogle);
	}, []);

	useEffect(() => {
		if (passkeysEnabled) {
			void reload();
		}
	}, [passkeysEnabled, reload]);

	if (!passkeysEnabled) {
		return (
			<div className="dg-form dg-scroll">
				<div className="dg-form-body">
					<h3 className="dg-form-title">Account</h3>
					<p className="dg-form-lead">
						{authDisabled
							? "This server runs without accounts, so there is nothing to sign in with."
							: `${user?.email ?? "You"} — this server has security keys turned off, so there is nothing to manage here.`}
					</p>
					<Name />
					<Appearance />
				</div>
			</div>
		);
	}

	const addKey = async () => {
		setBusy(true);
		setError(null);
		try {
			const optionsRes = await post(
				"/api/auth/passkey/register/options",
				{},
				csrfToken,
			);
			if (!optionsRes.ok) {
				setError(await messageOf(optionsRes, "Could not start registration"));
				return;
			}
			const optionsJSON = await optionsRes.json();
			let response: unknown;
			try {
				response = await startRegistration({ optionsJSON });
			} catch (err) {
				setError(ceremonyError(err, "Registration failed"));
				return;
			}
			const res = await post(
				"/api/auth/passkey/register/verify",
				{ response },
				csrfToken,
			);
			if (!res.ok) {
				setError(await messageOf(res, "Registration failed"));
				return;
			}
			await reload();
		} finally {
			setBusy(false);
		}
	};

	const rename = async (id: string, name: string) => {
		const trimmed = name.trim();
		if (trimmed === "") {
			return;
		}
		const res = await post(
			"/api/auth/passkeys/rename",
			{ id, name: trimmed },
			csrfToken,
		);
		if (!res.ok) {
			setError(await messageOf(res, "Rename failed"));
			return;
		}
		await reload();
	};

	const remove = async (id: string) => {
		setError(null);
		const res = await post("/api/auth/passkeys/delete", { id }, csrfToken);
		if (!res.ok) {
			setError(await messageOf(res, "Remove failed"));
			return;
		}
		await reload();
	};

	const onlyWayIn = !hasPassword && !hasGoogle && (passkeys?.length ?? 0) <= 1;

	return (
		<div className="dg-form dg-scroll">
			<div className="dg-form-body">
				<h3 className="dg-form-title">Account</h3>
				<p className="dg-form-lead">{user?.email}</p>

				<Name />
				<Appearance />

				<div className="dg-form-section">
					<span className="dg-form-section-title">Security keys</span>
					<p className="dg-form-note">
						A FIDO2 key — a YubiKey, or a passkey your device or phone holds.
						Signing in with one needs no email and no password: the key names
						the account and asks for its PIN.
					</p>
					{!hasPassword && !hasGoogle && (
						<p className="dg-form-note">
							This account has no password. Keep a second key registered, or you
							will be locked out if you lose the first.
						</p>
					)}
					{hasGoogle && (
						<p className="dg-form-note">
							This account also signs in with Google.
						</p>
					)}
					{error !== null && <p className="dg-test-failed">{error}</p>}
					{passkeys === null ? (
						<p className="dg-form-note">Loading…</p>
					) : passkeys.length === 0 ? (
						<p className="dg-form-note">No keys registered yet.</p>
					) : (
						<ul className="dg-member-list">
							{passkeys.map((passkey) => (
								<li key={passkey.id} className="dg-member-row">
									<TextInput
										className="dg-passkey-name"
										aria-label={`Name of ${passkey.name}`}
										defaultValue={passkey.name}
										onBlur={(event) => {
											if (event.target.value.trim() !== passkey.name) {
												void rename(passkey.id, event.target.value);
											}
										}}
									/>
									<span className="dg-passkey-meta">{describe(passkey)}</span>
									{passkey.backedUp && <span className="dg-badge">synced</span>}
									<button
										type="button"
										className="dg-document-delete"
										aria-label={`Remove ${passkey.name}`}
										disabled={onlyWayIn}
										title={
											onlyWayIn
												? "The only way into this account — add another key first"
												: "Remove this key"
										}
										onClick={() => void remove(passkey.id)}
									>
										<IconClose />
									</button>
								</li>
							))}
						</ul>
					)}
					{webAuthnAvailable ? (
						<div className="dg-frow">
							<button
								type="button"
								className="dg-btn dg-btn-pri"
								disabled={busy}
								onClick={() => void addKey()}
							>
								{busy ? "waiting for your key…" : "add a security key"}
							</button>
						</div>
					) : (
						<p className="dg-form-note">
							This browser cannot use security keys. WebAuthn needs a secure
							context — https, or localhost.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
