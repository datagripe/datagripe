import { z } from "zod";
import { capabilitySchema } from "./permissions";

/** Authentication and workspace-membership contracts (ADR 0002). */

export const workspaceRoleSchema = z.enum(["owner", "editor", "viewer"]);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/** Length of a display name; a header button is not a biography. */
export const DISPLAY_NAME_MAX = 32;

export const sessionUserSchema = z.object({
	id: z.uuid(),
	email: z.string().email(),
	/**
	 * What to call this person, when they have said. Null is the normal
	 * state and means "use the address": the address is the identity, and
	 * this is only what the header button and the online list show.
	 */
	name: z.string().nullable(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

/** GET /api/session bootstrap response. */
export const sessionBootstrapSchema = z.object({
	user: sessionUserSchema.nullable(),
	workspace: z
		.object({
			id: z.uuid(),
			name: z.string(),
			/** The name of the role they hold — "owner", or whatever this
			 * project called the one it made (docs/spec/permissions.md). */
			role: z.string(),
			/** What that role may do here. The client asks this, not the rank. */
			capabilities: z.array(capabilitySchema),
			defaultConnectionRef: z.string().nullable(),
		})
		.nullable(),
	csrfToken: z.string().nullable(),
	wsUrl: z.string(),
	/** True while zero users exist — show the bootstrap signup form. */
	bootstrap: z.boolean(),
	allowSignup: z.boolean(),
	/** True when the server runs without accounts (embedded local mode):
	 * the session is implicit and login/signup/logout do not exist. */
	authDisabled: z.boolean(),
	/** True when email+password sign-in exists here. False locks the
	 * deployment to security keys and/or Google (PASSWORD_AUTH_DISABLED). */
	passwordAuthEnabled: z.boolean(),
	/** True when security keys are available on this server — the flip
	 * side of authDisabled, plus whatever the deployment has turned off. */
	passkeysEnabled: z.boolean(),
	/** True when the deployment configured a Google OAuth client. */
	googleAuthEnabled: z.boolean(),
});

export type SessionBootstrap = z.infer<typeof sessionBootstrapSchema>;

export const loginRequestSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1).max(1024),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const signupRequestSchema = z.object({
	email: z.string().email(),
	password: z.string().min(12).max(1024),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const workspaceMemberSchema = z.object({
	userId: z.uuid(),
	email: z.string().email(),
	/** Their display name, when they have set one. */
	name: z.string().nullable(),
	/** The role's name, and the role it is (docs/spec/permissions.md). */
	role: z.string(),
	roleId: z.uuid().nullable(),
	since: z.iso.datetime(),
});

export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;

export const workspaceMembersResultSchema = z.object({
	members: z.array(workspaceMemberSchema),
});

export type WorkspaceMembersResult = z.infer<
	typeof workspaceMembersResultSchema
>;

export const memberAddRequestSchema = z.object({
	email: z.string().email(),
	role: z.enum(["editor", "viewer"]),
});

export type MemberAddRequest = z.infer<typeof memberAddRequestSchema>;

export const memberRemoveRequestSchema = z.object({
	userId: z.uuid(),
});

export type MemberRemoveRequest = z.infer<typeof memberRemoveRequestSchema>;

/** Workspace creation and listing (workspaces are the project unit). */
export const workspaceCreateRequestSchema = z.object({
	name: z.string().min(1).max(255),
});

export type WorkspaceCreateRequest = z.infer<
	typeof workspaceCreateRequestSchema
>;

export const workspaceRenameRequestSchema = z.object({
	name: z.string().min(1).max(255),
});

export type WorkspaceRenameRequest = z.infer<
	typeof workspaceRenameRequestSchema
>;

/**
 * Deleting a project names it rather than relying on the socket's
 * binding. The id is what the client believes it is deleting, and a
 * socket rebinds on a switch — so the one destructive action here says
 * out loud which project it meant, and the server refuses if that is
 * not the project it is bound to.
 */
export const workspaceDeleteRequestSchema = z.object({
	id: z.uuid(),
});

export type WorkspaceDeleteRequest = z.infer<
	typeof workspaceDeleteRequestSchema
>;

export const workspaceListEntrySchema = z.object({
	id: z.uuid(),
	name: z.string().min(1).max(255),
	role: workspaceRoleSchema,
});

export type WorkspaceListEntry = z.infer<typeof workspaceListEntrySchema>;

export const workspaceListResultSchema = z.object({
	workspaces: z.array(workspaceListEntrySchema),
});

export type WorkspaceListResult = z.infer<typeof workspaceListResultSchema>;

export const workspaceSetDefaultConnectionRequestSchema = z.object({
	/** Managed UUID, "predefined:<slug>", or null to clear. */
	connectionRef: z.string().min(1).max(255).nullable(),
});

export type WorkspaceSetDefaultConnectionRequest = z.infer<
	typeof workspaceSetDefaultConnectionRequestSchema
>;

/** `account.set-name` — null or empty clears it back to the address. */
export const accountSetNameRequestSchema = z.object({
	name: z.string().max(DISPLAY_NAME_MAX).nullable(),
});

export type AccountSetNameRequest = z.infer<typeof accountSetNameRequestSchema>;
