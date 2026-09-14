import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign as signWith } from "node:crypto";
import type { PasskeyListResult, SessionBootstrap } from "@datagripe/contracts";
import { SQL } from "bun";
import { createSessionStore, SESSION_COOKIE } from "../auth/sessions";
import type { AppConfig } from "../config";
import { migrate } from "../db/app/migrate";
import type { AppDb } from "../db/app/pool";
import { createRateLimiter } from "../security/rateLimit";
import { createAuthRoutes } from "./auth";
import { createPasskeyRoutes } from "./passkeys";

/**
 * Security-key routes against a real scratch app database, driven by a
 * software authenticator: the ceremonies are exercised end to end,
 * signature and all, rather than mocked at the library boundary.
 */

const ADMIN_URL = "postgres://datagripe:datagripe@localhost:5432/postgres";
const SCRATCH_DB = "datagripe_passkey_test";
const ORIGIN = "http://localhost:5173";
const RP_ID = "localhost";

/* ---- a minimal CBOR encoder, enough for an attestation object ------- */

function cborHead(major: number, value: number): Buffer {
	if (value < 24) {
		return Buffer.from([(major << 5) | value]);
	}
	if (value < 256) {
		return Buffer.from([(major << 5) | 24, value]);
	}
	if (value < 65536) {
		const buf = Buffer.alloc(3);
		buf[0] = (major << 5) | 25;
		buf.writeUInt16BE(value, 1);
		return buf;
	}
	const buf = Buffer.alloc(5);
	buf[0] = (major << 5) | 26;
	buf.writeUInt32BE(value, 1);
	return buf;
}

type CborValue = number | string | Buffer | Map<CborValue, CborValue>;

function cbor(value: CborValue): Buffer {
	if (typeof value === "number") {
		return value >= 0 ? cborHead(0, value) : cborHead(1, -value - 1);
	}
	if (typeof value === "string") {
		const bytes = Buffer.from(value, "utf8");
		return Buffer.concat([cborHead(3, bytes.length), bytes]);
	}
	if (Buffer.isBuffer(value)) {
		return Buffer.concat([cborHead(2, value.length), value]);
	}
	const parts = [cborHead(5, value.size)];
	for (const [key, entry] of value) {
		parts.push(cbor(key), cbor(entry));
	}
	return Buffer.concat(parts);
}

/* ---- the authenticator ---------------------------------------------- */

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

/** One discoverable ES256 credential, as a YubiKey would hold it. */
class SoftKey {
	readonly credentialId = Buffer.from(
		crypto.getRandomValues(new Uint8Array(32)),
	);
	private readonly keys = generateKeyPairSync("ec", {
		namedCurve: "prime256v1",
	});
	private counter = 0;
	/** Set at registration; replayed at sign-in like the real thing. */
	private userHandle: Buffer = Buffer.alloc(0);

	private cosePublicKey(): Buffer {
		const jwk = this.keys.publicKey.export({ format: "jwk" });
		return cbor(
			new Map<CborValue, CborValue>([
				[1, 2], // kty: EC2
				[3, -7], // alg: ES256
				[-1, 1], // crv: P-256
				[-2, Buffer.from(jwk.x as string, "base64url")],
				[-3, Buffer.from(jwk.y as string, "base64url")],
			]),
		);
	}

	private authData(flags: number, attested: Buffer | null): Buffer {
		const counter = Buffer.alloc(4);
		counter.writeUInt32BE(++this.counter);
		return Buffer.concat([
			createHash("sha256").update(RP_ID).digest(),
			Buffer.from([flags]),
			counter,
			...(attested === null ? [] : [attested]),
		]);
	}

	private clientData(type: string, challenge: string): Buffer {
		return Buffer.from(
			JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }),
			"utf8",
		);
	}

	register(options: { challenge: string; user: { id: string } }) {
		this.userHandle = Buffer.from(options.user.id, "base64url");
		const publicKey = this.cosePublicKey();
		const credIdLength = Buffer.alloc(2);
		credIdLength.writeUInt16BE(this.credentialId.length);
		const attested = Buffer.concat([
			Buffer.alloc(16), // aaguid — all zeroes, as "none" attestation requires
			credIdLength,
			this.credentialId,
			publicKey,
		]);
		const attestationObject = cbor(
			new Map<CborValue, CborValue>([
				["fmt", "none"],
				["attStmt", new Map()],
				["authData", this.authData(FLAG_UP | FLAG_UV | FLAG_AT, attested)],
			]),
		);
		return {
			id: this.credentialId.toString("base64url"),
			rawId: this.credentialId.toString("base64url"),
			type: "public-key",
			clientExtensionResults: {},
			response: {
				clientDataJSON: this.clientData(
					"webauthn.create",
					options.challenge,
				).toString("base64url"),
				attestationObject: attestationObject.toString("base64url"),
				transports: ["usb"],
			},
		};
	}

	authenticate(challenge: string) {
		const authData = this.authData(FLAG_UP | FLAG_UV, null);
		const clientDataJSON = this.clientData("webauthn.get", challenge);
		const signature = signWith(
			"sha256",
			Buffer.concat([
				authData,
				createHash("sha256").update(clientDataJSON).digest(),
			]),
			this.keys.privateKey,
		);
		return {
			id: this.credentialId.toString("base64url"),
			rawId: this.credentialId.toString("base64url"),
			type: "public-key",
			clientExtensionResults: {},
			response: {
				clientDataJSON: clientDataJSON.toString("base64url"),
				authenticatorData: authData.toString("base64url"),
				signature: signature.toString("base64url"),
				userHandle: this.userHandle.toString("base64url"),
			},
		};
	}
}

/* ---- harness --------------------------------------------------------- */

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
let auth: ReturnType<typeof createAuthRoutes>;
let passkeys: ReturnType<typeof createPasskeyRoutes>;

function req(
	path: string,
	init?: { method?: string; body?: unknown; cookie?: string; csrf?: string },
): Request {
	return new Request(`http://localhost${path}`, {
		method: init?.method ?? "GET",
		headers: {
			...(init?.body !== undefined
				? { "content-type": "application/json" }
				: {}),
			...(init?.cookie !== undefined
				? { cookie: `${SESSION_COOKIE}=${init.cookie}` }
				: {}),
			...(init?.csrf !== undefined ? { "x-csrf-token": init.csrf } : {}),
		},
		...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
	});
}

function sessionCookieOf(res: Response): string {
	const header = res.headers.get("set-cookie") ?? "";
	return new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(header)?.[1] ?? "";
}

async function csrfFor(cookie: string): Promise<string> {
	const boot = (await (
		await auth.session(req("/api/session", { cookie }))
	).json()) as SessionBootstrap;
	return boot.csrfToken ?? "";
}

/** Registration, both halves, with whatever session the caller has. */
async function registerKey(
	key: SoftKey,
	init: { email?: string; cookie?: string; csrf?: string },
): Promise<Response> {
	const optionsRes = await passkeys.registerOptions(
		req("/api/auth/passkey/register/options", {
			method: "POST",
			body: init.email === undefined ? {} : { email: init.email },
			...(init.cookie === undefined ? {} : { cookie: init.cookie }),
			...(init.csrf === undefined ? {} : { csrf: init.csrf }),
		}),
	);
	if (!optionsRes.ok) {
		return optionsRes;
	}
	const options = (await optionsRes.json()) as {
		challenge: string;
		user: { id: string };
	};
	return passkeys.registerVerify(
		req("/api/auth/passkey/register/verify", {
			method: "POST",
			body: { response: key.register(options) },
			...(init.cookie === undefined ? {} : { cookie: init.cookie }),
			...(init.csrf === undefined ? {} : { csrf: init.csrf }),
		}),
	);
}

async function signIn(key: SoftKey): Promise<Response> {
	const optionsRes = await passkeys.loginOptions(
		req("/api/auth/passkey/login/options", { method: "POST", body: {} }),
	);
	const options = (await optionsRes.json()) as { challenge: string };
	return passkeys.loginVerify(
		req("/api/auth/passkey/login/verify", {
			method: "POST",
			body: { response: key.authenticate(options.challenge) },
		}),
	);
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
		"TRUNCATE webauthn_credentials, webauthn_challenges, sessions, workspace_members, workspaces, users CASCADE",
	);

	const config = {
		NODE_ENV: "test",
		PORT: 3001,
		WEB_ORIGIN: ORIGIN,
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
		// Open, so the second account in these tests can be created.
		ALLOW_SIGNUP: true,
		TARGET_HOST_ALLOWLIST: "",
		SSRF_DISABLED: false,
		WEBAUTHN_RP_ID: RP_ID,
		WEBAUTHN_RP_NAME: "DataGripe",
		WEBAUTHN_ORIGINS: [ORIGIN],
	} satisfies AppConfig;
	const sessions = createSessionStore(appDb);
	const rateLimiter = createRateLimiter({
		"auth.login.ip": { capacity: 30, refillPerMinute: 30 },
		"auth.login.email": { capacity: 5, refillPerMinute: 5 },
		"auth.passkey.ip": { capacity: 200, refillPerMinute: 200 },
	});
	auth = createAuthRoutes({
		appDb,
		config,
		sessions,
		rateLimiter,
		closeSocketsForSession: () => {},
		localAuth: null,
	});
	passkeys = createPasskeyRoutes({
		appDb,
		config,
		sessions,
		rateLimiter,
		localAuth: null,
	});
});

afterAll(async () => {
	await appDb?.close();
});

describe("security keys", () => {
	const first = new SoftKey();
	const spare = new SoftKey();
	let cookie = "";

	pgTest(
		"a key creates the account it is the only credential for",
		async () => {
			const res = await registerKey(first, { email: "Key@Example.com" });
			expect(res.status).toBe(200);
			cookie = sessionCookieOf(res);
			expect(cookie.length).toBeGreaterThan(20);

			const boot = (await (
				await auth.session(req("/api/session", { cookie }))
			).json()) as SessionBootstrap;
			expect(boot.user).toMatchObject({ email: "key@example.com" });
			// The account counts as real even with no password, so the server
			// leaves bootstrap mode.
			expect(boot.bootstrap).toBe(false);
			expect(boot.passkeysEnabled).toBe(true);
		},
	);

	pgTest("that key signs in with no email and no password", async () => {
		const res = await signIn(first);
		expect(res.status).toBe(200);
		const token = sessionCookieOf(res);
		const boot = (await (
			await auth.session(req("/api/session", { cookie: token }))
		).json()) as SessionBootstrap;
		expect(boot.user).toMatchObject({ email: "key@example.com" });
	});

	pgTest(
		"the email is taken even though the account has no password",
		async () => {
			const res = await auth.signup(
				req("/api/auth/signup", {
					method: "POST",
					body: { email: "key@example.com", password: "a-perfectly-fine-one" },
				}),
			);
			expect(res.status).toBe(409);
		},
	);

	pgTest("a second key registers against the same account", async () => {
		const csrf = await csrfFor(cookie);
		const res = await registerKey(spare, { cookie, csrf });
		expect(res.status).toBe(200);

		const list = (await (
			await passkeys.list(req("/api/auth/passkeys", { cookie, csrf }))
		).json()) as PasskeyListResult;
		expect(list.passkeys).toHaveLength(2);
		expect(list.hasPassword).toBe(false);
		expect(list.passkeys.map((key) => key.name)).toEqual([
			"Security key",
			"Security key",
		]);

		// And it signs in on its own.
		expect((await signIn(spare)).status).toBe(200);
	});

	pgTest("listing keys is a read and needs no CSRF header", async () => {
		const res = await passkeys.list(req("/api/auth/passkeys", { cookie }));
		expect(res.status).toBe(200);
	});

	pgTest("the same key cannot be registered twice", async () => {
		const csrf = await csrfFor(cookie);
		// A real authenticator refuses via excludeCredentials; one that
		// ignored it gets a clean answer rather than a constraint violation.
		const res = await registerKey(first, { cookie, csrf });
		expect(res.status).toBe(409);
	});

	pgTest("adding a key needs the CSRF header", async () => {
		const res = await passkeys.registerOptions(
			req("/api/auth/passkey/register/options", {
				method: "POST",
				body: {},
				cookie,
			}),
		);
		expect(res.status).toBe(403);
	});

	pgTest("a key can be renamed and then removed", async () => {
		const csrf = await csrfFor(cookie);
		const before = (await (
			await passkeys.list(req("/api/auth/passkeys", { cookie, csrf }))
		).json()) as PasskeyListResult;
		const target = before.passkeys[1];
		expect(target).toBeDefined();

		const renamed = await passkeys.rename(
			req("/api/auth/passkeys/rename", {
				method: "POST",
				body: { id: target?.id, name: "Drawer spare" },
				cookie,
				csrf,
			}),
		);
		expect(renamed.status).toBe(200);

		const removed = await passkeys.remove(
			req("/api/auth/passkeys/delete", {
				method: "POST",
				body: { id: target?.id },
				cookie,
				csrf,
			}),
		);
		expect(removed.status).toBe(200);

		const after = (await (
			await passkeys.list(req("/api/auth/passkeys", { cookie, csrf }))
		).json()) as PasskeyListResult;
		expect(after.passkeys).toHaveLength(1);
	});

	pgTest("the last credential of a passwordless account stays", async () => {
		const csrf = await csrfFor(cookie);
		const list = (await (
			await passkeys.list(req("/api/auth/passkeys", { cookie, csrf }))
		).json()) as PasskeyListResult;
		const res = await passkeys.remove(
			req("/api/auth/passkeys/delete", {
				method: "POST",
				body: { id: list.passkeys[0]?.id },
				cookie,
				csrf,
			}),
		);
		expect(res.status).toBe(409);
	});

	pgTest("a challenge is good for exactly one verification", async () => {
		const optionsRes = await passkeys.loginOptions(
			req("/api/auth/passkey/login/options", { method: "POST", body: {} }),
		);
		const options = (await optionsRes.json()) as { challenge: string };
		const response = first.authenticate(options.challenge);

		const once = await passkeys.loginVerify(
			req("/api/auth/passkey/login/verify", {
				method: "POST",
				body: { response },
			}),
		);
		expect(once.status).toBe(200);

		const replay = await passkeys.loginVerify(
			req("/api/auth/passkey/login/verify", {
				method: "POST",
				body: { response },
			}),
		);
		expect(replay.status).toBe(401);
	});

	pgTest("an unregistered key is refused", async () => {
		const stranger = new SoftKey();
		expect((await signIn(stranger)).status).toBe(401);
	});

	pgTest("signup with an email that already exists is refused", async () => {
		const res = await registerKey(new SoftKey(), { email: "key@example.com" });
		expect(res.status).toBe(409);
	});
});
