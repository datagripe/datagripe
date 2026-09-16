import type { BuiltinRole, Capability } from "@datagripe/contracts";
import { BUILTIN_ROLE_CAPABILITIES, CAPABILITIES } from "@datagripe/contracts";
import type { AppDb } from "../db/app/pool";

/**
 * Account helpers: password hashing (bcrypt via Bun.password), email
 * normalization, and the bootstrap/membership rules from ADR 0002.
 */

export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
	return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPassword(
	password: string,
	hash: string,
): Promise<boolean> {
	return Bun.password.verify(password, hash);
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/**
 * Real accounts: those with a way to sign in. The pre-auth stub user has
 * no password, no security key and no external identity, so it never
 * counts — zero here is what puts the app in bootstrap mode.
 */
export async function userCount(appDb: AppDb): Promise<number> {
	const rows = await appDb<{ count: string | number }[]>`
		SELECT count(*) AS count FROM users u
		WHERE u.password_hash IS NOT NULL
			OR EXISTS (
				SELECT 1 FROM webauthn_credentials c WHERE c.user_id = u.id
			)
			OR EXISTS (
				SELECT 1 FROM oauth_identities o WHERE o.user_id = u.id
			)
	`;
	return Number(rows[0]?.count ?? 0);
}

/**
 * Is this email spoken for? Unlike {@link findUserByEmail} this ignores
 * how the account signs in — a key-only account still owns its address.
 */
export async function emailTaken(
	appDb: AppDb,
	email: string,
): Promise<boolean> {
	const rows = await appDb<{ id: string }[]>`
		SELECT id FROM users WHERE email = ${email}
	`;
	return rows[0] !== undefined;
}

/**
 * The account owning an address, however it signs in. Unlike
 * {@link findUserByEmail} this does not require a password — an external
 * identity linking itself to an existing account has to find key-only
 * and Google-only accounts too.
 */
export async function findUserIdByEmail(
	appDb: AppDb,
	email: string,
): Promise<string | null> {
	const rows = await appDb<{ id: string }[]>`
		SELECT id FROM users WHERE email = ${email}
	`;
	return rows[0]?.id ?? null;
}

export async function findUserById(
	appDb: AppDb,
	userId: string,
): Promise<{ id: string; email: string; hasPassword: boolean } | null> {
	const rows = await appDb<
		Array<{ id: string; email: string; password_hash: string | null }>
	>`
		SELECT id, email, password_hash FROM users WHERE id = ${userId}
	`;
	const row = rows[0];
	if (row === undefined) {
		return null;
	}
	return {
		id: row.id,
		email: row.email,
		hasPassword: row.password_hash !== null,
	};
}

export async function findUserByEmail(
	appDb: AppDb,
	email: string,
): Promise<{ id: string; email: string; passwordHash: string } | null> {
	const rows = await appDb<
		Array<{ id: string; email: string; password_hash: string | null }>
	>`
		SELECT id, email, password_hash FROM users WHERE email = ${email}
	`;
	const row = rows[0];
	if (row === undefined || row.password_hash === null) {
		return null;
	}
	return { id: row.id, email: row.email, passwordHash: row.password_hash };
}

/**
 * Create a real account. The FIRST account additionally inherits the
 * pre-auth stub workspace (its connections, documents, history) as owner;
 * later accounts get their own default workspace.
 *
 * `passwordHash` is null for a security-key account, and `id` is set when
 * the caller already committed to one — a WebAuthn registration hands the
 * authenticator the account id as its user handle before the account
 * exists, so the two have to agree.
 */
export async function createAccount(
	appDb: AppDb,
	email: string,
	passwordHash: string | null,
	id?: string,
): Promise<{ userId: string; workspaceId: string }> {
	return appDb.begin(async (tx) => {
		const users =
			id === undefined
				? await tx<{ id: string }[]>`
					INSERT INTO users (email, password_hash)
					VALUES (${email}, ${passwordHash})
					RETURNING id
				`
				: await tx<{ id: string }[]>`
					INSERT INTO users (id, email, password_hash)
					VALUES (${id}, ${email}, ${passwordHash})
					RETURNING id
				`;
		const user = users[0];
		if (user === undefined) {
			throw new Error("User insert returned no row");
		}

		// Inherit the stub workspace only while it has no owner member —
		// i.e. exactly one real account (the first) inherits it.
		const stub = await tx<{ id: string }[]>`
			SELECT w.id FROM workspaces w
			JOIN users u ON u.id = w.owner_id
			WHERE u.email = 'local@datagripe.local'
				AND NOT EXISTS (
					SELECT 1 FROM workspace_members m
					WHERE m.workspace_id = w.id AND m.role = 'owner'
				)
			LIMIT 1
		`;
		let workspaceId: string;
		if (stub[0] !== undefined) {
			workspaceId = stub[0].id;
			await tx`
				INSERT INTO workspace_members (workspace_id, user_id, role)
				VALUES (${workspaceId}, ${user.id}, 'owner')
				ON CONFLICT (workspace_id, user_id) DO NOTHING
			`;
		} else {
			const workspaces = await tx<{ id: string }[]>`
				INSERT INTO workspaces (owner_id, name)
				VALUES (${user.id}, 'Local')
				RETURNING id
			`;
			const workspace = workspaces[0];
			if (workspace === undefined) {
				throw new Error("Workspace insert returned no row");
			}
			workspaceId = workspace.id;
			await tx`
				INSERT INTO workspace_members (workspace_id, user_id, role)
				VALUES (${workspaceId}, ${user.id}, 'owner')
			`;
		}
		return { userId: user.id, workspaceId };
	});
}

/** The user's default workspace (first membership) and their role. */
export async function defaultWorkspaceFor(
	appDb: AppDb,
	userId: string,
): Promise<WorkspaceContext | null> {
	const rows = await appDb<WorkspaceContextRow[]>`
		SELECT w.id, w.name, m.role, w.default_connection_ref,
		       r.name AS role_name, r.capabilities
		FROM workspace_members m
		JOIN workspaces w ON w.id = m.workspace_id
		LEFT JOIN workspace_roles r ON r.id = m.role_id
		WHERE m.user_id = ${userId}
		ORDER BY w.created_at
		LIMIT 1
	`;
	return rows[0] === undefined ? null : rowToContext(rows[0]);
}

/** A specific workspace the user is a member of (switch target). */
export async function workspaceForMember(
	appDb: AppDb,
	userId: string,
	workspaceId: string,
): Promise<WorkspaceContext | null> {
	const rows = await appDb<WorkspaceContextRow[]>`
		SELECT w.id, w.name, m.role, w.default_connection_ref,
		       r.name AS role_name, r.capabilities
		FROM workspace_members m
		JOIN workspaces w ON w.id = m.workspace_id
		LEFT JOIN workspace_roles r ON r.id = m.role_id
		WHERE m.user_id = ${userId} AND w.id = ${workspaceId}
	`;
	return rows[0] === undefined ? null : rowToContext(rows[0]);
}

export interface WorkspaceContext {
	id: string;
	name: string;
	/** The role's name: a built-in's, or whatever this project called it. */
	role: string;
	/** What that role may do here (docs/spec/permissions.md). */
	capabilities: Capability[];
	defaultConnectionRef: string | null;
}

type WorkspaceContextRow = {
	id: string;
	name: string;
	role: BuiltinRole;
	role_name: string | null;
	capabilities: string[] | null;
	default_connection_ref: string | null;
};

function rowToContext(row: WorkspaceContextRow): WorkspaceContext {
	const known = new Set<string>(CAPABILITIES);
	return {
		id: row.id,
		name: row.name,
		role: row.role_name ?? row.role,
		// The rank is the fallback: a database mid-upgrade has no role rows
		// yet, and its members must not lose what they could already do.
		capabilities:
			row.capabilities === null
				? BUILTIN_ROLE_CAPABILITIES[row.role]
				: row.capabilities.filter((value): value is Capability =>
						known.has(value),
					),
		defaultConnectionRef: row.default_connection_ref,
	};
}
