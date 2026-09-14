import { ErrorCodes } from "@datagripe/contracts/errors";
import {
	createAccount,
	findUserIdByEmail,
	normalizeEmail,
	userCount,
} from "../auth/accounts";
import {
	ceremonyCookie,
	clearCeremonyCookie,
	codeChallenge,
	findIdentity,
	GOOGLE_PROVIDER,
	linkIdentity,
	newCeremonyState,
	OAUTH_COOKIE,
	openCeremonyState,
	recordIdentityUse,
	sealCeremonyState,
	stateMatches,
} from "../auth/oauth";
import { type SessionStore, sessionCookie } from "../auth/sessions";
import type { AppConfig } from "../config";
import type { AppDb } from "../db/app/pool";
import { log } from "../log";
import type { RateLimiter } from "../security/rateLimit";
import { type AuthRouteDeps, clientIp, cookiesFrom } from "./auth";
import { errorResponse } from "./errors";

/**
 * Google sign-in (docs/spec/auth-and-hardening.md "Google sign-in"):
 * OIDC authorization code with PKCE, ending in the same session cookie
 * every other method issues. Two routes, both plain browser navigations
 * — there is no XHR in this flow and so no CSRF token to carry; the
 * signed ceremony cookie is what ties the callback to the start.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Google's two spellings of itself. */
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
/** `openid email` and nothing else: the address is all DataGripe stores. */
const SCOPE = "openid email";

export interface GoogleIdentityClaims {
	sub: string;
	email: string | null;
	emailVerified: boolean;
	/** Google Workspace domain, when the account belongs to one. */
	hd: string | null;
	nonce: string | null;
}

export interface GoogleRouteDeps {
	appDb: AppDb;
	config: AppConfig;
	sessions: SessionStore;
	rateLimiter: RateLimiter;
	/** Non-null when the server runs without accounts; these routes 404. */
	localAuth: AuthRouteDeps["localAuth"];
	/**
	 * Exchange an authorization code for an id token. Injected so the
	 * route can be tested without talking to Google.
	 */
	exchangeCode?: (form: URLSearchParams) => Promise<string | null>;
}

/** POST the code to Google's token endpoint; returns the raw id token. */
async function exchangeWithGoogle(
	form: URLSearchParams,
): Promise<string | null> {
	const res = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: form,
	});
	if (!res.ok) {
		return null;
	}
	const body = (await res.json()) as { id_token?: unknown };
	return typeof body.id_token === "string" ? body.id_token : null;
}

/**
 * Read the claims out of an id token.
 *
 * The signature is deliberately not checked: this token did not come
 * through the browser, it came back on a TLS connection we opened to
 * Google's token endpoint and authenticated to with the client secret.
 * OIDC Core §3.1.3.7 allows skipping validation on that backchannel, and
 * the claims below — issuer, audience, expiry, nonce — are what actually
 * has to be verified either way.
 */
export function decodeIdToken(
	idToken: string,
	clientId: string,
	now: number = Date.now(),
): GoogleIdentityClaims | null {
	const parts = idToken.split(".");
	if (parts.length !== 3 || parts[1] === undefined) {
		return null;
	}
	let claims: Record<string, unknown>;
	try {
		claims = JSON.parse(
			Buffer.from(parts[1], "base64url").toString("utf8"),
		) as Record<string, unknown>;
	} catch {
		return null;
	}
	const iss = claims.iss;
	if (typeof iss !== "string" || !ISSUERS.includes(iss)) {
		return null;
	}
	// `aud` is a string for a single audience and an array otherwise.
	const aud = claims.aud;
	const audiences = Array.isArray(aud) ? aud : [aud];
	if (!audiences.includes(clientId)) {
		return null;
	}
	const exp = claims.exp;
	if (typeof exp !== "number" || exp * 1000 <= now) {
		return null;
	}
	const sub = claims.sub;
	if (typeof sub !== "string" || sub.length === 0) {
		return null;
	}
	return {
		sub,
		email: typeof claims.email === "string" ? claims.email : null,
		// Google sends this as a boolean; some clients have seen "true".
		emailVerified:
			claims.email_verified === true || claims.email_verified === "true",
		hd: typeof claims.hd === "string" ? claims.hd : null,
		nonce: typeof claims.nonce === "string" ? claims.nonce : null,
	};
}

/** The Workspace domain an identity belongs to, for the allowlist. */
function domainOf(claims: GoogleIdentityClaims): string | null {
	if (claims.hd !== null) {
		return claims.hd.toLowerCase();
	}
	const at = claims.email?.lastIndexOf("@") ?? -1;
	return at === -1
		? null
		: (claims.email as string).slice(at + 1).toLowerCase();
}

export function createGoogleRoutes(deps: GoogleRouteDeps) {
	const { appDb, config, sessions, rateLimiter, localAuth } = deps;
	const exchangeCode = deps.exchangeCode ?? exchangeWithGoogle;
	const secureCookie = config.NODE_ENV === "production";
	const enabled = localAuth === null && config.GOOGLE_AUTH_ENABLED;
	const clientId = config.GOOGLE_CLIENT_ID ?? "";

	const notFound = () =>
		errorResponse(404, ErrorCodes.NotFound, "Not found", crypto.randomUUID());

	/** Back to the app, with a message the sign-in screen shows. */
	function failed(message: string): Response {
		const target = new URL(config.WEB_ORIGIN);
		target.searchParams.set("auth_error", message);
		return new Response(null, {
			status: 302,
			headers: {
				location: target.toString(),
				"set-cookie": clearCeremonyCookie(),
			},
		});
	}

	return {
		/** Step one: hand the browser to Google with a sealed ceremony. */
		async start(req: Request): Promise<Response> {
			if (!enabled) {
				return notFound();
			}
			if (!rateLimiter.take("auth.oauth.ip", clientIp(req))) {
				return errorResponse(
					429,
					ErrorCodes.RateLimited,
					"Too many attempts",
					crypto.randomUUID(),
				);
			}
			const ceremony = newCeremonyState();
			const target = new URL(AUTHORIZE_URL);
			target.searchParams.set("client_id", clientId);
			target.searchParams.set("redirect_uri", config.GOOGLE_REDIRECT_URI);
			target.searchParams.set("response_type", "code");
			target.searchParams.set("scope", SCOPE);
			target.searchParams.set("state", ceremony.state);
			target.searchParams.set("nonce", ceremony.nonce);
			target.searchParams.set(
				"code_challenge",
				codeChallenge(ceremony.verifier),
			);
			target.searchParams.set("code_challenge_method", "S256");
			// No refresh token wanted: the session is ours, not Google's.
			target.searchParams.set("access_type", "online");
			target.searchParams.set("prompt", "select_account");
			// A single allowed domain is also a hint worth giving the
			// account chooser; several would only narrow it wrongly.
			if (config.GOOGLE_ALLOWED_DOMAINS.length === 1) {
				target.searchParams.set(
					"hd",
					config.GOOGLE_ALLOWED_DOMAINS[0] as string,
				);
			}
			return new Response(null, {
				status: 302,
				headers: {
					location: target.toString(),
					"set-cookie": ceremonyCookie(
						sealCeremonyState(ceremony, config.SESSION_SECRET),
						secureCookie,
					),
				},
			});
		},

		/** Step two: Google sends the browser back here with a code. */
		async callback(req: Request): Promise<Response> {
			if (!enabled) {
				return notFound();
			}
			const ip = clientIp(req);
			if (!rateLimiter.take("auth.oauth.ip", ip)) {
				return errorResponse(
					429,
					ErrorCodes.RateLimited,
					"Too many attempts",
					crypto.randomUUID(),
				);
			}
			const url = new URL(req.url);
			if (url.searchParams.get("error") !== null) {
				// access_denied is the user pressing cancel, not a fault.
				return url.searchParams.get("error") === "access_denied"
					? failed("Google sign-in was cancelled.")
					: failed("Google refused the sign-in request.");
			}
			const code = url.searchParams.get("code");
			const state = url.searchParams.get("state");
			if (code === null || state === null) {
				return failed("That Google sign-in was incomplete. Try again.");
			}
			const sealed = cookiesFrom(req)[OAUTH_COOKIE];
			const ceremony =
				sealed === undefined
					? null
					: openCeremonyState(sealed, config.SESSION_SECRET);
			if (ceremony === null || !stateMatches(ceremony.state, state)) {
				return failed("That Google sign-in expired. Try again.");
			}

			const form = new URLSearchParams({
				code,
				client_id: clientId,
				client_secret: config.GOOGLE_CLIENT_SECRET ?? "",
				redirect_uri: config.GOOGLE_REDIRECT_URI,
				grant_type: "authorization_code",
				code_verifier: ceremony.verifier,
			});
			let idToken: string | null;
			try {
				idToken = await exchangeCode(form);
			} catch (error) {
				log.error("auth.google.exchange_failed", {
					message: error instanceof Error ? error.message : String(error),
				});
				idToken = null;
			}
			const claims = idToken === null ? null : decodeIdToken(idToken, clientId);
			if (claims === null) {
				log.audit("auth.login.failure", { ip, method: "google" });
				return failed("Google did not confirm that sign-in.");
			}
			if (claims.nonce !== ceremony.nonce) {
				log.audit("auth.login.failure", { ip, method: "google" });
				return failed("Google did not confirm that sign-in.");
			}

			const allowed = config.GOOGLE_ALLOWED_DOMAINS;
			const domain = domainOf(claims);
			if (
				allowed.length > 0 &&
				(domain === null || !allowed.includes(domain))
			) {
				log.audit("auth.login.failure", {
					ip,
					method: "google",
					reason: "domain",
					domain,
				});
				return failed("That Google account is not allowed on this server.");
			}

			const existing = await findIdentity(appDb, GOOGLE_PROVIDER, claims.sub);
			let userId: string;
			if (existing !== null) {
				userId = existing.userId;
				await recordIdentityUse(
					appDb,
					GOOGLE_PROVIDER,
					claims.sub,
					claims.email,
				);
			} else {
				// A first sign-in needs the address, both to link an existing
				// account and to create a new one.
				if (claims.email === null || !claims.emailVerified) {
					return failed(
						"Google did not confirm an email address for that account.",
					);
				}
				const email = normalizeEmail(claims.email);
				const linked = await findUserIdByEmail(appDb, email);
				if (linked !== null) {
					// Google verified the address, so the account is theirs.
					userId = linked;
					log.audit("auth.google.link", { userId, email });
				} else {
					if ((await userCount(appDb)) > 0 && !config.ALLOW_SIGNUP) {
						return failed("Signup is disabled on this server.");
					}
					const account = await createAccount(appDb, email, null);
					userId = account.userId;
					log.audit("auth.signup", { userId, email, method: "google" });
				}
				await linkIdentity(appDb, {
					userId,
					provider: GOOGLE_PROVIDER,
					subject: claims.sub,
					email,
				});
				await recordIdentityUse(appDb, GOOGLE_PROVIDER, claims.sub, email);
			}

			log.audit("auth.login.success", { userId, ip, method: "google" });
			const created = await sessions.create(userId);
			const headers = new Headers({ location: config.WEB_ORIGIN });
			headers.append("set-cookie", sessionCookie(created.token, secureCookie));
			headers.append("set-cookie", clearCeremonyCookie());
			return new Response(null, { status: 302, headers });
		},
	};
}
