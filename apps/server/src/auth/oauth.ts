import {
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import type { AppDb } from "../db/app/pool";

/**
 * External identity providers (docs/spec/auth-and-hardening.md "Google
 * sign-in"): the `oauth_identities` rows a sign-in is matched against,
 * and the signed cookie that carries one ceremony's state across the
 * round trip to the provider.
 *
 * An identity is matched on the provider's subject, never on the email:
 * people rename their address and the subject does not move. The email
 * is only what a *first* sign-in creates or links the local account by.
 */

export const GOOGLE_PROVIDER = "google";

export interface OAuthIdentity {
	userId: string;
	provider: string;
	subject: string;
	email: string | null;
}

/** The account this provider subject belongs to, if it has one yet. */
export async function findIdentity(
	appDb: AppDb,
	provider: string,
	subject: string,
): Promise<OAuthIdentity | null> {
	const rows = await appDb<
		Array<{
			user_id: string;
			provider: string;
			subject: string;
			email: string | null;
		}>
	>`
		SELECT user_id, provider, subject, email FROM oauth_identities
		WHERE provider = ${provider} AND subject = ${subject}
	`;
	const row = rows[0];
	if (row === undefined) {
		return null;
	}
	return {
		userId: row.user_id,
		provider: row.provider,
		subject: row.subject,
		email: row.email,
	};
}

/** Bind a provider subject to an account. Re-linking is a no-op. */
export async function linkIdentity(
	appDb: AppDb,
	identity: OAuthIdentity,
): Promise<void> {
	await appDb`
		INSERT INTO oauth_identities (user_id, provider, subject, email)
		VALUES (${identity.userId}, ${identity.provider}, ${identity.subject}, ${identity.email})
		ON CONFLICT (provider, subject) DO NOTHING
	`;
}

export async function recordIdentityUse(
	appDb: AppDb,
	provider: string,
	subject: string,
	email: string | null,
): Promise<void> {
	await appDb`
		UPDATE oauth_identities
		SET last_used_at = now(), email = ${email}
		WHERE provider = ${provider} AND subject = ${subject}
	`;
}

/** Does this account have an external identity to fall back on? Read by
 * the "you are removing the only way in" check on security keys. */
export async function hasIdentity(
	appDb: AppDb,
	userId: string,
): Promise<boolean> {
	const rows = await appDb<{ id: string }[]>`
		SELECT id FROM oauth_identities WHERE user_id = ${userId} LIMIT 1
	`;
	return rows[0] !== undefined;
}

/**
 * One ceremony's state. It has to survive a redirect to Google and back
 * with no session to keep it in, so it rides in a signed, short-lived
 * cookie rather than a database row — nothing here is a secret worth
 * storing, and the signature is what makes it unforgeable.
 */
export interface CeremonyState {
	/** Echoed by the provider; guards against a forged callback. */
	state: string;
	/** PKCE: the secret whose hash went out with the authorize request. */
	verifier: string;
	/** Bound into the id token, so a replayed one is detectable. */
	nonce: string;
}

export const OAUTH_COOKIE = "dg_oauth";
export const OAUTH_COOKIE_PATH = "/api/auth/google";
const OAUTH_TTL_SECONDS = 600;

export function newCeremonyState(): CeremonyState {
	return {
		state: randomBytes(32).toString("base64url"),
		verifier: randomBytes(32).toString("base64url"),
		nonce: randomBytes(16).toString("base64url"),
	};
}

/** PKCE S256: what the authorize request carries in place of the verifier. */
export function codeChallenge(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

function sign(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** `<payload>.<hmac>`, so a tampered cookie fails to open. */
export function sealCeremonyState(
	state: CeremonyState,
	secret: string,
): string {
	const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
	return `${payload}.${sign(payload, secret)}`;
}

export function openCeremonyState(
	sealed: string,
	secret: string,
): CeremonyState | null {
	const dot = sealed.lastIndexOf(".");
	if (dot === -1) {
		return null;
	}
	const payload = sealed.slice(0, dot);
	const provided = Buffer.from(sealed.slice(dot + 1));
	const expected = Buffer.from(sign(payload, secret));
	if (
		provided.length !== expected.length ||
		!timingSafeEqual(provided, expected)
	) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8"),
		);
		const { state, verifier, nonce } = parsed as Partial<CeremonyState>;
		if (
			typeof state !== "string" ||
			typeof verifier !== "string" ||
			typeof nonce !== "string"
		) {
			return null;
		}
		return { state, verifier, nonce };
	} catch {
		return null;
	}
}

export function ceremonyCookie(sealed: string, secure: boolean): string {
	const parts = [
		`${OAUTH_COOKIE}=${sealed}`,
		`Path=${OAUTH_COOKIE_PATH}`,
		"HttpOnly",
		// Lax, not Strict: the cookie has to survive Google's top-level
		// GET navigation back to the callback, and Strict withholds it.
		"SameSite=Lax",
		`Max-Age=${OAUTH_TTL_SECONDS}`,
	];
	if (secure) {
		parts.push("Secure");
	}
	return parts.join("; ");
}

export function clearCeremonyCookie(): string {
	return `${OAUTH_COOKIE}=; Path=${OAUTH_COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Constant-time comparison of the state we issued and the one returned. */
export function stateMatches(expected: string, provided: string): boolean {
	const a = Buffer.from(expected);
	const b = Buffer.from(provided);
	return a.length === b.length && timingSafeEqual(a, b);
}
