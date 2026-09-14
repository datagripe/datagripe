import type { AppDb } from "../db/app/pool";

/**
 * Security-key storage: credentials, and the single-use challenges that
 * bind one step of a ceremony to the next
 * (docs/spec/auth-and-hardening.md "Security keys").
 *
 * Sign-in is usernameless, so every credential is registered as
 * discoverable and carries the account's id as its user handle. Lookup
 * at login is therefore by credential id alone.
 */

/** WebAuthn's byte arrays, as the verification library types them. */
type Bytes = Uint8Array<ArrayBuffer>;

export interface StoredCredential {
	id: string;
	userId: string;
	credentialId: string;
	publicKey: Bytes;
	counter: number;
	transports: string[];
	name: string;
	backedUp: boolean;
	createdAt: Date;
	lastUsedAt: Date | null;
}

export interface NewCredential {
	userId: string;
	credentialId: string;
	publicKey: Uint8Array;
	counter: number;
	transports: string[];
	aaguid: string | null;
	backedUp: boolean;
	deviceType: string;
	name: string;
}

type CredentialRow = {
	id: string;
	user_id: string;
	credential_id: string;
	public_key: Uint8Array | Buffer;
	counter: string | number;
	transports: string[] | null;
	name: string;
	backed_up: boolean;
	created_at: string | Date;
	last_used_at: string | Date | null;
};

function toCredential(row: CredentialRow): StoredCredential {
	return {
		id: row.id,
		userId: row.user_id,
		credentialId: row.credential_id,
		publicKey: Uint8Array.from(row.public_key),
		counter: Number(row.counter),
		transports: row.transports ?? [],
		name: row.name,
		backedUp: row.backed_up,
		createdAt: new Date(row.created_at),
		lastUsedAt: row.last_used_at === null ? null : new Date(row.last_used_at),
	};
}

export async function listCredentials(
	appDb: AppDb,
	userId: string,
): Promise<StoredCredential[]> {
	const rows = await appDb<CredentialRow[]>`
		SELECT id, user_id, credential_id, public_key, counter,
			transports, name, backed_up, created_at, last_used_at FROM webauthn_credentials
		WHERE user_id = ${userId}
		ORDER BY created_at
	`;
	return rows.map(toCredential);
}

/** Login's only lookup: the credential names its own account. */
export async function findCredential(
	appDb: AppDb,
	credentialId: string,
): Promise<StoredCredential | null> {
	const rows = await appDb<CredentialRow[]>`
		SELECT id, user_id, credential_id, public_key, counter,
			transports, name, backed_up, created_at, last_used_at FROM webauthn_credentials
		WHERE credential_id = ${credentialId}
	`;
	return rows[0] === undefined ? null : toCredential(rows[0]);
}

export async function insertCredential(
	appDb: AppDb,
	credential: NewCredential,
): Promise<StoredCredential> {
	const rows = await appDb<CredentialRow[]>`
		INSERT INTO webauthn_credentials
			(user_id, credential_id, public_key, counter, transports, aaguid,
			 backed_up, device_type, name)
		VALUES (
			${credential.userId}, ${credential.credentialId},
			${Buffer.from(credential.publicKey)}, ${credential.counter},
			${JSON.stringify(credential.transports)}, ${credential.aaguid},
			${credential.backedUp}, ${credential.deviceType}, ${credential.name}
		)
		RETURNING id, user_id, credential_id, public_key, counter,
			transports, name, backed_up, created_at, last_used_at
	`;
	const row = rows[0];
	if (row === undefined) {
		throw new Error("Credential insert returned no row");
	}
	return toCredential(row);
}

/**
 * Record a successful assertion. The counter only ever moves forward —
 * the caller has already rejected a regression as a cloned key.
 */
export async function recordCredentialUse(
	appDb: AppDb,
	credentialId: string,
	counter: number,
	backedUp: boolean,
): Promise<void> {
	await appDb`
		UPDATE webauthn_credentials
		SET counter = ${counter}, backed_up = ${backedUp}, last_used_at = now()
		WHERE credential_id = ${credentialId}
	`;
}

export async function renameCredential(
	appDb: AppDb,
	userId: string,
	id: string,
	name: string,
): Promise<boolean> {
	const rows = await appDb<{ id: string }[]>`
		UPDATE webauthn_credentials SET name = ${name}
		WHERE id = ${id} AND user_id = ${userId}
		RETURNING id
	`;
	return rows[0] !== undefined;
}

export async function deleteCredential(
	appDb: AppDb,
	userId: string,
	id: string,
): Promise<boolean> {
	const rows = await appDb<{ id: string }[]>`
		DELETE FROM webauthn_credentials
		WHERE id = ${id} AND user_id = ${userId}
		RETURNING id
	`;
	return rows[0] !== undefined;
}

export type ChallengePurpose = "registration" | "authentication";

export interface ChallengeRecord {
	challenge: string;
	purpose: ChallengePurpose;
	/** Set when an existing account is adding a key. */
	userId: string | null;
	/** Set when the ceremony will create an account. */
	email: string | null;
	/** The id that account will be created with — also its user handle. */
	pendingUserId: string | null;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function storeChallenge(
	appDb: AppDb,
	record: ChallengeRecord,
): Promise<void> {
	const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
	await appDb`
		INSERT INTO webauthn_challenges
			(challenge, purpose, user_id, email, pending_user_id, expires_at)
		VALUES (
			${record.challenge}, ${record.purpose}, ${record.userId},
			${record.email}, ${record.pendingUserId}, ${expiresAt.toISOString()}
		)
	`;
}

/**
 * Take a challenge and destroy it in the same statement: a challenge is
 * good for exactly one verification, whether or not that one succeeds.
 */
export async function consumeChallenge(
	appDb: AppDb,
	challenge: string,
	purpose: ChallengePurpose,
): Promise<ChallengeRecord | null> {
	const rows = await appDb<
		Array<{
			challenge: string;
			purpose: ChallengePurpose;
			user_id: string | null;
			email: string | null;
			pending_user_id: string | null;
		}>
	>`
		DELETE FROM webauthn_challenges
		WHERE challenge = ${challenge}
			AND purpose = ${purpose}
			AND expires_at > now()
		RETURNING challenge, purpose, user_id, email, pending_user_id
	`;
	const row = rows[0];
	if (row === undefined) {
		return null;
	}
	return {
		challenge: row.challenge,
		purpose: row.purpose,
		userId: row.user_id,
		email: row.email,
		pendingUserId: row.pending_user_id,
	};
}

export async function sweepChallenges(appDb: AppDb): Promise<void> {
	await appDb`DELETE FROM webauthn_challenges WHERE expires_at < now()`;
}

const CHALLENGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Expired challenges are already inert — {@link consumeChallenge} will
 * not return one — so this is housekeeping, not a control. Returns the
 * stopper.
 */
export function startChallengeSweep(appDb: AppDb): () => void {
	const timer = setInterval(() => {
		void sweepChallenges(appDb).catch(() => {});
	}, CHALLENGE_SWEEP_INTERVAL_MS);
	timer.unref();
	return () => clearInterval(timer);
}

/**
 * The user handle stored on the authenticator: the account id as UTF-8,
 * base64url-encoded the way the browser reports it back at login.
 */
export function encodeUserHandle(userId: string): Bytes {
	return Uint8Array.from(Buffer.from(userId, "utf8"));
}

export function decodeUserHandle(handle: string): string | null {
	try {
		return Buffer.from(handle, "base64url").toString("utf8");
	} catch {
		return null;
	}
}
