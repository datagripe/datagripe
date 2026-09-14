import { z } from "zod";

/**
 * FIDO2 / WebAuthn security-key contracts
 * (docs/spec/auth-and-hardening.md "Security keys").
 *
 * Sign-in is usernameless: the browser picks a discoverable credential
 * and the credential itself names the account, so the login request
 * carries no email. Registration is the only flow that needs one, and
 * only when it is creating the account.
 */

/** Ceremony payloads are WebAuthn JSON — structure checked by the
 * library that verifies them, not here. */
const ceremonyResponse = z.looseObject({
	id: z.string().min(1).max(1024),
	rawId: z.string().min(1).max(1024),
	type: z.string().min(1).max(64),
	response: z.looseObject({}),
});

/** Label shown in the key list; defaulted from the authenticator when
 * the browser can name it, otherwise "Security key". */
export const passkeyNameSchema = z.string().trim().min(1).max(64);

export const passkeyRegisterOptionsRequestSchema = z.object({
	/** Only for signup — creating the account this key will own. Omitted
	 * when a signed-in account is adding another key. */
	email: z.string().email().optional(),
});

export type PasskeyRegisterOptionsRequest = z.infer<
	typeof passkeyRegisterOptionsRequestSchema
>;

export const passkeyRegisterVerifyRequestSchema = z.object({
	response: ceremonyResponse,
	name: passkeyNameSchema.optional(),
});

export type PasskeyRegisterVerifyRequest = z.infer<
	typeof passkeyRegisterVerifyRequestSchema
>;

export const passkeyLoginVerifyRequestSchema = z.object({
	response: ceremonyResponse,
});

export type PasskeyLoginVerifyRequest = z.infer<
	typeof passkeyLoginVerifyRequestSchema
>;

export const passkeySchema = z.object({
	id: z.uuid(),
	name: z.string(),
	createdAt: z.iso.datetime(),
	lastUsedAt: z.iso.datetime().nullable(),
	/** Synced to a passkey provider rather than living on one device. */
	backedUp: z.boolean(),
	transports: z.array(z.string()),
});

export type Passkey = z.infer<typeof passkeySchema>;

export const passkeyListResultSchema = z.object({
	passkeys: z.array(passkeySchema),
	/** False once the account would have no way back in — the UI blocks
	 * removing the last credential. */
	hasPassword: z.boolean(),
});

export type PasskeyListResult = z.infer<typeof passkeyListResultSchema>;

export const passkeyRenameRequestSchema = z.object({
	id: z.uuid(),
	name: passkeyNameSchema,
});

export type PasskeyRenameRequest = z.infer<typeof passkeyRenameRequestSchema>;

export const passkeyDeleteRequestSchema = z.object({
	id: z.uuid(),
});

export type PasskeyDeleteRequest = z.infer<typeof passkeyDeleteRequestSchema>;
