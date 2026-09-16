import { z } from "zod";

/**
 * What a member of a project may do (docs/spec/permissions.md).
 *
 * Three fixed roles answered "can this person edit" and nothing else.
 * The questions people actually have are narrower and do not nest:
 * *this* person should be able to expose the project over MCP, *that*
 * one should run the sync, everybody in support should tag domains and
 * touch nothing else. A rank cannot express any of that, and adding a
 * fourth and fifth rank only moves the argument.
 *
 * So: a role is a **name and a set of capabilities**, roles belong to a
 * project, and every member has one. Owner, editor and viewer still
 * exist — they are seeded rows with the capabilities they always had,
 * which is why upgrading changes nothing — and a project can add its
 * own beside them.
 *
 * Reading is not a capability. Being a member is being able to read:
 * browse the schema, read the history, watch what other people run, and
 * see the access report. A project that needs to hide data from a member
 * is asking for a second datasource, not a checkbox.
 */

export const capabilitySchema = z.enum([
	/** Run and cancel statements. */
	"query.run",
	/** Edit rows in the table view. */
	"data.write",
	/** Change a table's structure (columns, for now). */
	"schema.change",
	/** Create, save and archive workspace files, and open files from disk. */
	"document.write",
	/** Add, edit and remove datasources, and their per-project settings. */
	"datasource.manage",
	/** Create domains and tag objects into them. */
	"domain.manage",
	/** Dismiss a gripe, and restore a dismissal. */
	"gripe.dismiss",
	/** Stage, commit and pull in a repository datasource. */
	"git.commit",
	/** Mark a database role untrusted, which is what the report reads. */
	"access.manage",
	/** Export or import a domain: writes the host's disk. */
	"sync.run",
	/** Push, and add or remove a repository datasource: reaches a remote. */
	"git.push",
	/** Approve and run a repository's declared commands. */
	"repo.commands",
	/** Turn the project's MCP server on, and mint or revoke its tokens. */
	"mcp.manage",
	/** Add and remove members, and manage the project's roles. */
	"members.manage",
	/** Rename the project, and delete it. */
	"project.manage",
	/** Restart the server, where the deployment allows it. */
	"server.restart",
]);

export type Capability = z.infer<typeof capabilitySchema>;

export const CAPABILITIES: Capability[] = capabilitySchema.options;

/** The built-in roles every project has, and cannot delete. */
export const builtinRoleSchema = z.enum(["owner", "editor", "viewer"]);

export type BuiltinRole = z.infer<typeof builtinRoleSchema>;

/**
 * Exactly what the three ranks could do before roles existed. Changing
 * a number here changes what an upgraded deployment's members may do,
 * so: don't, without saying so in the changelog.
 */
export const BUILTIN_ROLE_CAPABILITIES: Record<BuiltinRole, Capability[]> = {
	viewer: [],
	editor: [
		"query.run",
		"data.write",
		"schema.change",
		"document.write",
		"datasource.manage",
		"domain.manage",
		"gripe.dismiss",
		"git.commit",
		"access.manage",
	],
	owner: [...CAPABILITIES],
};

/** How the matrix is grouped, so sixteen rows read as four decisions. */
export const CAPABILITY_GROUPS: Array<{
	title: string;
	capabilities: Capability[];
}> = [
	{
		title: "Working in the project",
		capabilities: [
			"query.run",
			"data.write",
			"schema.change",
			"document.write",
			"gripe.dismiss",
		],
	},
	{
		title: "Organising it",
		capabilities: ["datasource.manage", "domain.manage", "access.manage"],
	},
	{
		title: "Reaching outside it",
		capabilities: [
			"git.commit",
			"git.push",
			"sync.run",
			"repo.commands",
			"mcp.manage",
		],
	},
	{
		title: "Running it",
		capabilities: ["members.manage", "project.manage", "server.restart"],
	},
];

/** One line each, shown beside the checkbox. */
export const CAPABILITY_LABELS: Record<
	Capability,
	{ title: string; detail: string }
> = {
	"query.run": {
		title: "Run queries",
		detail: "Run and cancel statements against this project's datasources.",
	},
	"data.write": {
		title: "Edit data",
		detail: "Change, insert and delete rows in the table view.",
	},
	"schema.change": {
		title: "Change structure",
		detail: "Alter columns, with the SQL shown before it runs.",
	},
	"document.write": {
		title: "Edit files",
		detail:
			"Create, save and archive the project's shared files, and open files from a datasource path.",
	},
	"gripe.dismiss": {
		title: "Dismiss gripes",
		detail: "Turn a finding off for an occurrence, an object or the project.",
	},
	"datasource.manage": {
		title: "Manage datasources",
		detail:
			"Add, edit and remove datasources, and change their per-project settings.",
	},
	"domain.manage": {
		title: "Manage domains",
		detail: "Create domains, and tag objects into them.",
	},
	"access.manage": {
		title: "Mark roles untrusted",
		detail:
			"Decide which database roles the grant rules treat as untrusted. Reading the access report needs nothing.",
	},
	"git.commit": {
		title: "Commit and pull",
		detail: "Stage, commit and pull in a repository datasource. Local only.",
	},
	"git.push": {
		title: "Push, and add repositories",
		detail: "Reaches the remote: push, and add or remove a git datasource.",
	},
	"sync.run": {
		title: "Export and import domains",
		detail: "Writes the host's filesystem, and commits when git is on.",
	},
	"repo.commands": {
		title: "Approve and run repo commands",
		detail:
			"The only feature that runs a program DataGripe did not write. Approving the list is the security boundary.",
	},
	"mcp.manage": {
		title: "Manage the MCP server",
		detail:
			"Turn the project's endpoint on, choose its mode, and mint or revoke tokens.",
	},
	"members.manage": {
		title: "Manage members and roles",
		detail: "Add and remove people, and edit what the roles here can do.",
	},
	"project.manage": {
		title: "Rename or delete the project",
		detail:
			"Change the project's name, and delete the project — which takes everything DataGripe holds about it and leaves the host's files alone.",
	},
	"server.restart": {
		title: "Restart the server",
		detail:
			"Where the deployment is supervised, end the process so it comes back on a new image. Interrupts everybody.",
	},
};

/** Length of a role name: it sits in a member row and a dropdown. */
export const ROLE_NAME_MAX = 40;

export const workspaceRoleEntrySchema = z.object({
	id: z.uuid(),
	name: z.string().min(1).max(ROLE_NAME_MAX),
	capabilities: z.array(capabilitySchema),
	/** Set for the three that ship with every project; they cannot be removed. */
	builtin: builtinRoleSchema.nullable(),
	/** How many members hold it, so removing one is an informed decision. */
	members: z.number().int().nonnegative(),
});

export type WorkspaceRoleEntry = z.infer<typeof workspaceRoleEntrySchema>;

export const roleListResultSchema = z.object({
	roles: z.array(workspaceRoleEntrySchema),
});

export type RoleListResult = z.infer<typeof roleListResultSchema>;

export const roleUpsertRequestSchema = z.object({
	/** Absent creates a role; present edits one. */
	id: z.uuid().optional(),
	name: z.string().min(1).max(ROLE_NAME_MAX),
	capabilities: z.array(capabilitySchema),
});

export type RoleUpsertRequest = z.infer<typeof roleUpsertRequestSchema>;

export const roleDeleteRequestSchema = z.object({ id: z.uuid() });

export type RoleDeleteRequest = z.infer<typeof roleDeleteRequestSchema>;

export const memberSetRoleRequestSchema = z.object({
	userId: z.uuid(),
	roleId: z.uuid(),
});

export type MemberSetRoleRequest = z.infer<typeof memberSetRoleRequestSchema>;
