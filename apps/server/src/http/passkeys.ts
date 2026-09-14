import {
	type Passkey,
	passkeyDeleteRequestSchema,
	passkeyLoginVerifyRequestSchema,
	passkeyRegisterOptionsRequestSchema,
	passkeyRegisterVerifyRequestSchema,
	passkeyRenameRequestSchema,
} from "@datagripe/contracts";
import { ErrorCodes } from "@datagripe/contracts/errors";
import type {
	AuthenticationResponseJSON,
	RegistrationResponseJSON,
	WebAuthnCredential,
} from "@simplewebauthn/server";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import {
	createAccount,
	emailTaken,
	findUserById,
	normalizeEmail,
	userCount,
} from "../auth/accounts";
import {
	csrfMatches,
	type SessionStore,
	sessionCookie,
} from "../auth/sessions";
import {
	consumeChallenge,
	decodeUserHandle,
	deleteCredential,
	encodeUserHandle,
	findCredential,
	insertCredential,
	listCredentials,
	recordCredentialUse,
	renameCredential,
	storeChallenge,
} from "../auth/webauthn";
import type { AppConfig } from "../config";
import type { AppDb } from "../db/app/pool";
import { log } from "../log";
import type { RateLimiter } from "../security/rateLimit";
import { type AuthRouteDeps, clientIp, json, sessionFromRequest } from "./auth";
import { errorResponse } from "./errors";

/**
 * FIDO2 / WebAuthn routes (docs/spec/auth-and-hardening.md "Security
 * keys"): register a key — either onto a signed-in account or as the
 * credential a brand-new account is created with — sign in with one, and
 * manage the list.
 *
 * Sign-in is usernameless. Registration therefore asks for a
 * discoverable credential with user verification, which on a hardware
 * key means a PIN: the key alone must not be enough, because for a
 * key-only account there is no password behind it.
 */

export interface PasskeyRouteDeps {
	appDb: AppDb;
	config: AppConfig;
	sessions: SessionStore;
	rateLimiter: RateLimiter;
	/** Non-null when the server runs without accounts; these routes 404. */
	localAuth: AuthRouteDeps["localAuth"];
}

/** How long the browser may take to get a touch out of the user. */
const CEREMONY_TIMEOUT_MS = 120_000;

/**
 * A label to show before the user picks a better one. The browser never
 * names the authenticator, but it does say how it was reached, and that
 * distinguishes the three cases people actually have side by side.
 */
function defaultCredentialName(transports: string[]): string {
	if (transports.includes("internal")) {
		return "This device";
	}
	if (transports.includes("hybrid")) {
		return "Phone or tablet";
	}
	return "Security key";
}

/** The challenge the authenticator signed, read back out of its own
 * client data — the only thing tying a verify call to its options call
 * when the user has no session yet. */
function challengeOf(clientDataJSON: unknown): string | null {
	if (typeof clientDataJSON !== "string") {
		return null;
	}
	try {
		const decoded: unknown = JSON.parse(
			Buffer.from(clientDataJSON, "base64url").toString("utf8"),
		);
		const challenge = (decoded as { challenge?: unknown }).challenge;
		return typeof challenge === "string" ? challenge : null;
	} catch {
		return null;
	}
}

function toPasskey(credential: {
	id: string;
	name: string;
	createdAt: Date;
	lastUsedAt: Date | null;
	backedUp: boolean;
	transports: string[];
}): Passkey {
	return {
		id: credential.id,
		name: credential.name,
		createdAt: credential.createdAt.toISOString(),
		lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
		backedUp: credential.backedUp,
		transports: credential.transports,
	};
}

export function createPasskeyRoutes(deps: PasskeyRouteDeps) {
	const { appDb, config, sessions, rateLimiter, localAuth } = deps;
	const secureCookie = config.NODE_ENV === "production";
	const rpID = config.WEBAUTHN_RP_ID;
	const origins = config.WEBAUTHN_ORIGINS;

	const notFound = () =>
		errorResponse(404, ErrorCodes.NotFound, "Not found", crypto.randomUUID());

	async function readBody(
		req: Request,
		requestId: string,
	): Promise<{ body: unknown } | { failure: Response }> {
		try {
			return { body: await req.json() };
		} catch {
			return {
				failure: errorResponse(
					400,
					ErrorCodes.BadRequest,
					"Invalid JSON",
					requestId,
				),
			};
		}
	}

	/** A session, and nothing more — enough to read your own key list. */
	async function authenticated(
		req: Request,
		requestId: string,
	): Promise<{ userId: string } | { failure: Response }> {
		const session = await sessionFromRequest(sessions, req);
		if (session === null) {
			return {
				failure: errorResponse(
					401,
					ErrorCodes.Unauthorized,
					"A valid session is required",
					requestId,
				),
			};
		}
		return { userId: session.userId };
	}

	/** Session + CSRF, the gate on everything that changes the key list. */
	async function authorized(
		req: Request,
		requestId: string,
	): Promise<{ userId: string } | { failure: Response }> {
		const session = await sessionFromRequest(sessions, req);
		if (session === null) {
			return {
				failure: errorResponse(
					401,
					ErrorCodes.Unauthorized,
					"A valid session is required",
					requestId,
				),
			};
		}
		if (
			!csrfMatches(session.csrfToken, req.headers.get("x-csrf-token") ?? "")
		) {
			return {
				failure: errorResponse(
					403,
					ErrorCodes.Forbidden,
					"CSRF token mismatch",
					requestId,
				),
			};
		}
		return { userId: session.userId };
	}

	function limited(req: Request, requestId: string): Response | null {
		if (rateLimiter.take("auth.passkey.ip", clientIp(req))) {
			return null;
		}
		return errorResponse(
			429,
			ErrorCodes.RateLimited,
			"Too many attempts",
			requestId,
		);
	}

	/** Signup is open while the server has no accounts, and after that
	 * only when the operator said so. Checked when the options are issued
	 * and again when the credential comes back. */
	async function signupClosed(requestId: string): Promise<Response | null> {
		if ((await userCount(appDb)) === 0 || config.ALLOW_SIGNUP) {
			return null;
		}
		return errorResponse(
			403,
			ErrorCodes.Forbidden,
			"Signup is disabled on this server",
			requestId,
		);
	}

	return {
		/** Step one of registration, for a signed-in account or a signup. */
		async registerOptions(req: Request): Promise<Response> {
			if (localAuth !== null) {
				return notFound();
			}
			const requestId = crypto.randomUUID();
			const rateLimited = limited(req, requestId);
			if (rateLimited !== null) {
				return rateLimited;
			}
			const read = await readBody(req, requestId);
			if ("failure" in read) {
				return read.failure;
			}
			const parsed = passkeyRegisterOptionsRequestSchema.safeParse(read.body);
			if (!parsed.success) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"A valid email is required",
					requestId,
				);
			}

			const session = await sessionFromRequest(sessions, req);
			if (session !== null) {
				// Adding another key to the account already signed in.
				const auth = await authorized(req, requestId);
				if ("failure" in auth) {
					return auth.failure;
				}
				const user = await findUserById(appDb, auth.userId);
				if (user === null) {
					return errorResponse(
						401,
						ErrorCodes.Unauthorized,
						"A valid session is required",
						requestId,
					);
				}
				const existing = await listCredentials(appDb, user.id);
				const options = await generateRegistrationOptions({
					rpName: config.WEBAUTHN_RP_NAME,
					rpID,
					userName: user.email,
					userDisplayName: user.email,
					userID: encodeUserHandle(user.id),
					timeout: CEREMONY_TIMEOUT_MS,
					attestationType: "none",
					excludeCredentials: existing.map((credential) => ({
						id: credential.credentialId,
						transports: credential.transports,
					})),
					authenticatorSelection: {
						residentKey: "required",
						userVerification: "required",
					},
				});
				await storeChallenge(appDb, {
					challenge: options.challenge,
					purpose: "registration",
					userId: user.id,
					email: null,
					pendingUserId: null,
				});
				return json(options);
			}

			// Signup: the account does not exist yet, so its id is decided
			// here and handed to the authenticator as the user handle.
			if (parsed.data.email === undefined) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"An email is required to create an account",
					requestId,
				);
			}
			const closed = await signupClosed(requestId);
			if (closed !== null) {
				return closed;
			}
			const email = normalizeEmail(parsed.data.email);
			if (await emailTaken(appDb, email)) {
				return errorResponse(
					409,
					ErrorCodes.Conflict,
					"An account with this email already exists",
					requestId,
				);
			}
			const pendingUserId = crypto.randomUUID();
			const options = await generateRegistrationOptions({
				rpName: config.WEBAUTHN_RP_NAME,
				rpID,
				userName: email,
				userDisplayName: email,
				userID: encodeUserHandle(pendingUserId),
				timeout: CEREMONY_TIMEOUT_MS,
				attestationType: "none",
				authenticatorSelection: {
					residentKey: "required",
					userVerification: "required",
				},
			});
			await storeChallenge(appDb, {
				challenge: options.challenge,
				purpose: "registration",
				userId: null,
				email,
				pendingUserId,
			});
			return json(options);
		},

		/** Step two: store the credential, creating the account with it if
		 * that is what the challenge was issued for. */
		async registerVerify(req: Request): Promise<Response> {
			if (localAuth !== null) {
				return notFound();
			}
			const requestId = crypto.randomUUID();
			const rateLimited = limited(req, requestId);
			if (rateLimited !== null) {
				return rateLimited;
			}
			const read = await readBody(req, requestId);
			if ("failure" in read) {
				return read.failure;
			}
			const parsed = passkeyRegisterVerifyRequestSchema.safeParse(read.body);
			if (!parsed.success) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"A registration response is required",
					requestId,
				);
			}
			// Shape-checked by the verifier below, not by the schema: the
			// ceremony payload is WebAuthn's to define.
			const response = parsed.data
				.response as unknown as RegistrationResponseJSON;
			const challenge = challengeOf(response.response.clientDataJSON);
			if (challenge === null) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"Malformed registration response",
					requestId,
				);
			}
			const record = await consumeChallenge(appDb, challenge, "registration");
			if (record === null) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"This registration expired — start again",
					requestId,
				);
			}

			let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
			try {
				verification = await verifyRegistrationResponse({
					response,
					expectedChallenge: challenge,
					expectedOrigin: origins,
					expectedRPID: rpID,
					requireUserVerification: true,
				});
			} catch (error) {
				log.audit("auth.passkey.register.failure", {
					reason: error instanceof Error ? error.message : "unknown",
					ip: clientIp(req),
				});
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"That security key could not be verified",
					requestId,
				);
			}
			if (!verification.verified) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"That security key could not be verified",
					requestId,
				);
			}

			const info = verification.registrationInfo;
			const transports = response.response.transports ?? [];
			const name = parsed.data.name ?? defaultCredentialName(transports);

			// Adding to an account: the session that asked for the challenge
			// must still be the session presenting the credential.
			if (record.userId !== null) {
				const auth = await authorized(req, requestId);
				if ("failure" in auth) {
					return auth.failure;
				}
				if (auth.userId !== record.userId) {
					return errorResponse(
						403,
						ErrorCodes.Forbidden,
						"This registration belongs to another account",
						requestId,
					);
				}
				if ((await findCredential(appDb, info.credential.id)) !== null) {
					return errorResponse(
						409,
						ErrorCodes.Conflict,
						"That key is already registered",
						requestId,
					);
				}
				const credential = await insertCredential(appDb, {
					userId: record.userId,
					credentialId: info.credential.id,
					publicKey: info.credential.publicKey,
					counter: info.credential.counter,
					transports,
					aaguid: info.aaguid,
					backedUp: info.credentialBackedUp,
					deviceType: info.credentialDeviceType,
					name,
				});
				log.audit("auth.passkey.register", {
					userId: record.userId,
					passkeyId: credential.id,
				});
				return json({ passkey: toPasskey(credential) });
			}

			// Signup. Re-check the gate and the email: both could have
			// changed while the user was looking for their key.
			if (record.email === null || record.pendingUserId === null) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"This registration expired — start again",
					requestId,
				);
			}
			const closed = await signupClosed(requestId);
			if (closed !== null) {
				return closed;
			}
			if (await emailTaken(appDb, record.email)) {
				return errorResponse(
					409,
					ErrorCodes.Conflict,
					"An account with this email already exists",
					requestId,
				);
			}
			if ((await findCredential(appDb, info.credential.id)) !== null) {
				return errorResponse(
					409,
					ErrorCodes.Conflict,
					"That key already belongs to an account — sign in with it instead",
					requestId,
				);
			}
			const account = await createAccount(
				appDb,
				record.email,
				null,
				record.pendingUserId,
			);
			await insertCredential(appDb, {
				userId: account.userId,
				credentialId: info.credential.id,
				publicKey: info.credential.publicKey,
				counter: info.credential.counter,
				transports,
				aaguid: info.aaguid,
				backedUp: info.credentialBackedUp,
				deviceType: info.credentialDeviceType,
				name,
			});
			log.audit("auth.signup", {
				userId: account.userId,
				email: record.email,
				method: "passkey",
			});
			const created = await sessions.create(account.userId);
			return json(
				{ ok: true },
				{
					headers: { "set-cookie": sessionCookie(created.token, secureCookie) },
				},
			);
		},

		/** Step one of sign-in. Usernameless: no allowCredentials, so the
		 * browser offers whatever discoverable credentials it can find. */
		async loginOptions(req: Request): Promise<Response> {
			if (localAuth !== null) {
				return notFound();
			}
			const requestId = crypto.randomUUID();
			const rateLimited = limited(req, requestId);
			if (rateLimited !== null) {
				return rateLimited;
			}
			const options = await generateAuthenticationOptions({
				rpID,
				timeout: CEREMONY_TIMEOUT_MS,
				userVerification: "required",
				allowCredentials: [],
			});
			await storeChallenge(appDb, {
				challenge: options.challenge,
				purpose: "authentication",
				userId: null,
				email: null,
				pendingUserId: null,
			});
			return json(options);
		},

		/** Step two: the credential names the account, so there is nothing
		 * else to look it up by. */
		async loginVerify(req: Request): Promise<Response> {
			if (localAuth !== null) {
				return notFound();
			}
			const requestId = crypto.randomUUID();
			const ip = clientIp(req);
			const rateLimited = limited(req, requestId);
			if (rateLimited !== null) {
				return rateLimited;
			}
			const read = await readBody(req, requestId);
			if ("failure" in read) {
				return read.failure;
			}
			const parsed = passkeyLoginVerifyRequestSchema.safeParse(read.body);
			if (!parsed.success) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"An authentication response is required",
					requestId,
				);
			}
			const response = parsed.data
				.response as unknown as AuthenticationResponseJSON;
			const challenge = challengeOf(response.response.clientDataJSON);
			if (challenge === null) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"Malformed authentication response",
					requestId,
				);
			}
			const record = await consumeChallenge(appDb, challenge, "authentication");
			const rejected = () => {
				log.audit("auth.passkey.login.failure", {
					credentialId: response.id,
					ip,
				});
				return errorResponse(
					401,
					ErrorCodes.Unauthorized,
					"That security key was not recognised",
					requestId,
				);
			};
			if (record === null) {
				return rejected();
			}
			const credential = await findCredential(appDb, response.id);
			if (credential === null) {
				return rejected();
			}
			// The authenticator reports which account it signed for; it has
			// to be the one that owns this credential.
			const handle = response.response.userHandle;
			if (
				typeof handle === "string" &&
				decodeUserHandle(handle) !== credential.userId
			) {
				return rejected();
			}

			let verification: Awaited<
				ReturnType<typeof verifyAuthenticationResponse>
			>;
			try {
				verification = await verifyAuthenticationResponse({
					response,
					expectedChallenge: challenge,
					expectedOrigin: origins,
					expectedRPID: rpID,
					requireUserVerification: true,
					credential: {
						id: credential.credentialId,
						publicKey: credential.publicKey,
						counter: credential.counter,
						transports: credential.transports as NonNullable<
							WebAuthnCredential["transports"]
						>,
					},
				});
			} catch {
				// Includes a counter that failed to advance, which means a
				// cloned authenticator rather than a typo.
				return rejected();
			}
			if (!verification.verified) {
				return rejected();
			}

			await recordCredentialUse(
				appDb,
				credential.credentialId,
				verification.authenticationInfo.newCounter,
				verification.authenticationInfo.credentialBackedUp,
			);
			log.audit("auth.login.success", {
				userId: credential.userId,
				ip,
				method: "passkey",
			});
			const created = await sessions.create(credential.userId);
			return json(
				{ ok: true },
				{
					headers: { "set-cookie": sessionCookie(created.token, secureCookie) },
				},
			);
		},

		async list(req: Request): Promise<Response> {
			if (localAuth !== null) {
				return notFound();
			}
			const requestId = crypto.randomUUID();
			const auth = await authenticated(req, requestId);
			if ("failure" in auth) {
				return auth.failure;
			}
			const [credentials, user] = await Promise.all([
				listCredentials(appDb, auth.userId),
				findUserById(appDb, auth.userId),
			]);
			return json({
				passkeys: credentials.map(toPasskey),
				hasPassword: user?.hasPassword ?? false,
			});
		},

		async rename(req: Request): Promise<Response> {
			if (localAuth !== null) {
				return notFound();
			}
			const requestId = crypto.randomUUID();
			const auth = await authorized(req, requestId);
			if ("failure" in auth) {
				return auth.failure;
			}
			const read = await readBody(req, requestId);
			if ("failure" in read) {
				return read.failure;
			}
			const parsed = passkeyRenameRequestSchema.safeParse(read.body);
			if (!parsed.success) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"A key and a name of 1–64 characters are required",
					requestId,
				);
			}
			const renamed = await renameCredential(
				appDb,
				auth.userId,
				parsed.data.id,
				parsed.data.name,
			);
			if (!renamed) {
				return errorResponse(
					404,
					ErrorCodes.NotFound,
					"No such security key",
					requestId,
				);
			}
			return json({ ok: true });
		},

		/** Removing the last way into an account is not a thing we do. */
		async remove(req: Request): Promise<Response> {
			if (localAuth !== null) {
				return notFound();
			}
			const requestId = crypto.randomUUID();
			const auth = await authorized(req, requestId);
			if ("failure" in auth) {
				return auth.failure;
			}
			const read = await readBody(req, requestId);
			if ("failure" in read) {
				return read.failure;
			}
			const parsed = passkeyDeleteRequestSchema.safeParse(read.body);
			if (!parsed.success) {
				return errorResponse(
					400,
					ErrorCodes.BadRequest,
					"A key id is required",
					requestId,
				);
			}
			const [credentials, user] = await Promise.all([
				listCredentials(appDb, auth.userId),
				findUserById(appDb, auth.userId),
			]);
			if (user?.hasPassword !== true && credentials.length <= 1) {
				return errorResponse(
					409,
					ErrorCodes.Conflict,
					"This is the only way into your account — set a password or add another key first",
					requestId,
				);
			}
			const removed = await deleteCredential(
				appDb,
				auth.userId,
				parsed.data.id,
			);
			if (!removed) {
				return errorResponse(
					404,
					ErrorCodes.NotFound,
					"No such security key",
					requestId,
				);
			}
			log.audit("auth.passkey.remove", {
				userId: auth.userId,
				passkeyId: parsed.data.id,
			});
			return json({ ok: true });
		},
	};
}
