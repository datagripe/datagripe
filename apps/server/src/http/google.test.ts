import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import {
	createSessionStore,
	SESSION_COOKIE,
	type SessionStore,
} from "../auth/sessions";
import type { AppConfig } from "../config";
import { migrate } from "../db/app/migrate";
import type { AppDb } from "../db/app/pool";
import { createRateLimiter } from "../security/rateLimit";
import { createGoogleRoutes, decodeIdToken } from "./google";

/**
 * Google sign-in, driven end to end against a scratch app database: the
 * ceremony cookie and state the start route issues are the ones the
 * callback is handed back, and only the token exchange is stubbed —
 * there is no network in a test.
 */

const ADMIN_URL = "postgres://datagripe:datagripe@localhost:5432/postgres";
const SCRATCH_DB = "datagripe_google_test";
const CLIENT_ID = "client-id.apps.googleusercontent.com";
const WEB_ORIGIN = "http://localhost:5173";

async function probe(): Promise<boolean> {
	try {
		const sql = new SQL(ADMIN_URL, { connectionTimeout: 2 });
		await sql`SELECT 1`;
		await sql.close();
		return true;
	} catch {
		return false;
	}
}

const reachable = await probe();
const pgTest = reachable ? test : test.skip;

let appDb: AppDb;
let sessions: SessionStore;

/** An id token as Google's token endpoint returns it. The signature is
 * never checked (see decodeIdToken), so the bytes there are filler. */
function idToken(claims: Record<string, unknown>): string {
	const part = (value: unknown) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${part({ alg: "RS256" })}.${part({
		iss: "https://accounts.google.com",
		aud: CLIENT_ID,
		exp: Math.floor(Date.now() / 1000) + 300,
		...claims,
	})}.signature`;
}

const baseConfig = {
	NODE_ENV: "test",
	PORT: 3001,
	HOST: "0.0.0.0",
	WEB_ORIGIN,
	DATABASE_MODE: "external",
	APP_DATABASE_URL: "",
	EMBEDDED_PG_DATA_DIR: "./data/pg",
	EMBEDDED_PG_PORT: 0,
	EMBEDDED_PG_PASSWORD: undefined,
	AUTH_DISABLED: false,
	CONNECTION_ENCRYPTION_KEY: "test-key-0123456789abcdef0123",
	SESSION_SECRET: "test-secret-0123456789abcdef01234",
	QUERY_TIMEOUT_MS: 30_000,
	QUERY_MAX_ROWS: 10_000,
	QUERY_MAX_BYTES: 25_000_000,
	MAX_CONCURRENT_QUERIES_PER_USER: 3,
	MCP_ENABLED: true,
	MCP_MAX_ROWS: 200,
	MCP_MAX_BYTES: 1_000_000,
	MCP_READ_MAX_BYTES: 65_536,
	MCP_INSTRUCTIONS_MAX_BYTES: 16_384,
	DOMAIN_EXPORT_ROOTS: "",
	HOST_FS_ROOTS: "",
	HOST_FS_DISABLED: false,
	DOMAIN_EXPORT_GIT: false,
	DOMAIN_GIT_TIMEOUT_MS: 60_000,
	GIT_ENABLED: false,
	GIT_REPOS_DIR: "./data/repos",
	GIT_TIMEOUT_MS: 60_000,
	GIT_CLONE_TIMEOUT_MS: 600_000,
	REPO_COMMANDS_ENABLED: false,
	REPO_COMMAND_TIMEOUT_MS: 600_000,
	REPO_COMMAND_DEFAULT_TIMEOUT_MS: 120_000,
	DOMAIN_EXPORT_MAX_DATA_ROWS: 10_000,
	ACCESS_REPORT_MAX_CELLS: 250_000,
	ALLOW_SIGNUP: true,
	TARGET_HOST_ALLOWLIST: "",
	SSRF_DISABLED: false,
	WEBAUTHN_RP_ID: "localhost",
	WEBAUTHN_RP_NAME: "DataGripe",
	PASSWORD_AUTH_DISABLED: false,
	PASSKEY_AUTH_DISABLED: false,
	GOOGLE_CLIENT_ID: CLIENT_ID,
	GOOGLE_CLIENT_SECRET: "client-secret",
	GOOGLE_AUTH_ENABLED: true,
	GOOGLE_REDIRECT_URI: `${WEB_ORIGIN}/api/auth/google/callback`,
	GOOGLE_ALLOWED_DOMAINS: [],
	WEBAUTHN_ORIGINS: [WEB_ORIGIN],
} satisfies AppConfig;

function routesWith(
	overrides: Partial<AppConfig>,
	exchangeCode: (form: URLSearchParams) => Promise<string | null>,
) {
	return createGoogleRoutes({
		appDb,
		config: { ...baseConfig, ...overrides },
		sessions,
		rateLimiter: createRateLimiter({
			"auth.oauth.ip": { capacity: 200, refillPerMinute: 200 },
		}),
		localAuth: null,
		exchangeCode,
	});
}

/** Walk the ceremony: start, then hand the callback what Google would. */
async function signIn(
	claims: (nonce: string) => Record<string, unknown>,
	overrides: Partial<AppConfig> = {},
	tamper: (params: URLSearchParams) => void = () => {},
): Promise<Response> {
	const routes = routesWith(overrides, async () => null);
	const started = await routes.start(
		new Request("http://localhost/api/auth/google/start"),
	);
	const authorize = new URL(started.headers.get("location") as string);
	const cookie = (started.headers.get("set-cookie") as string).split(";")[0];
	const nonce = authorize.searchParams.get("nonce") as string;

	const back = new URL("http://localhost/api/auth/google/callback");
	back.searchParams.set("code", "auth-code");
	back.searchParams.set("state", authorize.searchParams.get("state") as string);
	tamper(back.searchParams);
	const withToken = routesWith(overrides, async () => idToken(claims(nonce)));
	return withToken.callback(
		new Request(back.toString(), { headers: { cookie: cookie as string } }),
	);
}

function sessionCookieOf(res: Response): string | null {
	for (const header of res.headers.getSetCookie()) {
		const match = new RegExp(`^${SESSION_COOKIE}=([^;]+)`).exec(header);
		if (match !== null && match[1] !== "") {
			return match[1] ?? null;
		}
	}
	return null;
}

function authErrorOf(res: Response): string | null {
	const location = new URL(res.headers.get("location") as string);
	return location.searchParams.get("auth_error");
}

beforeAll(async () => {
	if (!reachable) {
		return;
	}
	const admin = new SQL(ADMIN_URL);
	const existing =
		await admin`SELECT 1 FROM pg_database WHERE datname = ${SCRATCH_DB}`;
	if (existing.length === 0) {
		await admin.unsafe(`CREATE DATABASE ${SCRATCH_DB}`);
	}
	await admin.close();
	appDb = new SQL(
		`postgres://datagripe:datagripe@localhost:5432/${SCRATCH_DB}`,
	);
	await migrate(appDb);
	await appDb.unsafe(
		"TRUNCATE oauth_identities, sessions, workspace_members, workspaces, users CASCADE",
	);
	sessions = createSessionStore(appDb);
});

afterAll(async () => {
	sessions?.stopSweep();
	await appDb?.close();
});

describe("id token claims", () => {
	test("accepts a well-formed token", () => {
		const claims = decodeIdToken(
			idToken({ sub: "1", email: "a@example.com", email_verified: true }),
			CLIENT_ID,
		);
		expect(claims).toMatchObject({ sub: "1", emailVerified: true });
	});

	test("refuses another client's audience", () => {
		expect(
			decodeIdToken(idToken({ sub: "1", aud: "someone-else" }), CLIENT_ID),
		).toBeNull();
	});

	test("refuses a foreign issuer", () => {
		expect(
			decodeIdToken(
				idToken({ sub: "1", iss: "https://evil.example.com" }),
				CLIENT_ID,
			),
		).toBeNull();
	});

	test("refuses an expired token", () => {
		expect(
			decodeIdToken(
				idToken({ sub: "1", exp: Math.floor(Date.now() / 1000) - 10 }),
				CLIENT_ID,
			),
		).toBeNull();
	});
});

describe("google sign-in", () => {
	test("the start route hands the browser a PKCE challenge", async () => {
		const routes = routesWith({}, async () => null);
		const res = await routes.start(
			new Request("http://localhost/api/auth/google/start"),
		);
		expect(res.status).toBe(302);
		const location = new URL(res.headers.get("location") as string);
		expect(location.host).toBe("accounts.google.com");
		expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
		expect(location.searchParams.get("code_challenge_method")).toBe("S256");
		expect(location.searchParams.get("code_challenge")).not.toBeNull();
		expect(location.searchParams.get("state")).not.toBeNull();
		expect(res.headers.get("set-cookie")).toContain("dg_oauth=");
		expect(res.headers.get("set-cookie")).toContain("HttpOnly");
	});

	test("both routes are absent without a configured client", async () => {
		const routes = routesWith({ GOOGLE_AUTH_ENABLED: false }, async () => null);
		expect(
			(
				await routes.start(
					new Request("http://localhost/api/auth/google/start"),
				)
			).status,
		).toBe(404);
		expect(
			(
				await routes.callback(
					new Request(
						"http://localhost/api/auth/google/callback?code=x&state=y",
					),
				)
			).status,
		).toBe(404);
	});

	pgTest(
		"a first sign-in creates the account and links the identity",
		async () => {
			const res = await signIn((nonce) => ({
				sub: "google-subject-1",
				email: "Ada@Example.com",
				email_verified: true,
				nonce,
			}));
			expect(res.status).toBe(302);
			expect(res.headers.get("location")).toBe(WEB_ORIGIN);
			expect(sessionCookieOf(res)).not.toBeNull();

			const rows = await appDb<{ email: string; user_id: string }[]>`
			SELECT u.email, o.user_id FROM oauth_identities o
			JOIN users u ON u.id = o.user_id
			WHERE o.provider = 'google' AND o.subject = 'google-subject-1'
		`;
			expect(rows).toHaveLength(1);
			expect(rows[0]?.email).toBe("ada@example.com");
		},
	);

	pgTest("a second sign-in reuses the same account", async () => {
		const before = await appDb<{ count: string }[]>`
			SELECT count(*) AS count FROM users
		`;
		const res = await signIn((nonce) => ({
			sub: "google-subject-1",
			email: "ada@example.com",
			email_verified: true,
			nonce,
		}));
		expect(sessionCookieOf(res)).not.toBeNull();
		const after = await appDb<{ count: string }[]>`
			SELECT count(*) AS count FROM users
		`;
		expect(Number(after[0]?.count)).toBe(Number(before[0]?.count));
	});

	pgTest("a verified address links to the account that owns it", async () => {
		await appDb`
			INSERT INTO users (email, password_hash) VALUES ('grace@example.com', 'x')
		`;
		const res = await signIn((nonce) => ({
			sub: "google-subject-2",
			email: "grace@example.com",
			email_verified: true,
			nonce,
		}));
		expect(sessionCookieOf(res)).not.toBeNull();
		const rows = await appDb<{ email: string }[]>`
			SELECT u.email FROM oauth_identities o
			JOIN users u ON u.id = o.user_id
			WHERE o.subject = 'google-subject-2'
		`;
		expect(rows[0]?.email).toBe("grace@example.com");
	});

	pgTest("an unverified address is refused", async () => {
		const res = await signIn((nonce) => ({
			sub: "google-subject-3",
			email: "spoof@example.com",
			email_verified: false,
			nonce,
		}));
		expect(sessionCookieOf(res)).toBeNull();
		expect(authErrorOf(res)).toContain("email address");
	});

	pgTest("a returned state that is not ours is refused", async () => {
		const res = await signIn(
			(nonce) => ({
				sub: "google-subject-4",
				email: "mallory@example.com",
				email_verified: true,
				nonce,
			}),
			{},
			(params) => params.set("state", "forged-state"),
		);
		expect(sessionCookieOf(res)).toBeNull();
		expect(authErrorOf(res)).toContain("expired");
	});

	pgTest("a replayed token with the wrong nonce is refused", async () => {
		const res = await signIn(() => ({
			sub: "google-subject-5",
			email: "replay@example.com",
			email_verified: true,
			nonce: "some-other-ceremony",
		}));
		expect(sessionCookieOf(res)).toBeNull();
		expect(authErrorOf(res)).toContain("did not confirm");
	});

	pgTest("a domain outside the allowlist is refused", async () => {
		const res = await signIn(
			(nonce) => ({
				sub: "google-subject-6",
				email: "outsider@gmail.com",
				email_verified: true,
				nonce,
			}),
			{ GOOGLE_ALLOWED_DOMAINS: ["corp.example.com"] },
		);
		expect(sessionCookieOf(res)).toBeNull();
		expect(authErrorOf(res)).toContain("not allowed");
	});

	pgTest("the allowlist admits its own Workspace domain", async () => {
		const res = await signIn(
			(nonce) => ({
				sub: "google-subject-7",
				email: "insider@corp.example.com",
				email_verified: true,
				hd: "corp.example.com",
				nonce,
			}),
			{ GOOGLE_ALLOWED_DOMAINS: ["corp.example.com"] },
		);
		expect(sessionCookieOf(res)).not.toBeNull();
	});

	pgTest("a new account is refused while signup is closed", async () => {
		const res = await signIn(
			(nonce) => ({
				sub: "google-subject-8",
				email: "late@example.com",
				email_verified: true,
				nonce,
			}),
			{ ALLOW_SIGNUP: false },
		);
		expect(sessionCookieOf(res)).toBeNull();
		expect(authErrorOf(res)).toContain("Signup is disabled");
	});

	pgTest(
		"an existing identity still signs in while signup is closed",
		async () => {
			const res = await signIn(
				(nonce) => ({
					sub: "google-subject-1",
					email: "ada@example.com",
					email_verified: true,
					nonce,
				}),
				{ ALLOW_SIGNUP: false },
			);
			expect(sessionCookieOf(res)).not.toBeNull();
		},
	);
});
