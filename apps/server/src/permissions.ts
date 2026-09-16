import type {
	BuiltinRole,
	Capability,
	WorkspaceRoleEntry,
} from "@datagripe/contracts";
import { BUILTIN_ROLE_CAPABILITIES, CAPABILITIES } from "@datagripe/contracts";
import type { ClientAction } from "@datagripe/contracts/ws";
import type { AppDb } from "./db/app/pool";

/**
 * What a member may do, and which capability each action needs
 * (docs/spec/permissions.md).
 *
 * The rank is gone from the decision: an action names a capability, a
 * member holds a role, and a role is a set of capabilities. An action
 * absent from this map needs none — being a member is being able to
 * read, and the reading actions are the majority.
 *
 * This map is the security boundary, so it is exhaustive on purpose
 * rather than clever: adding an action that writes something and
 * forgetting to name its capability makes it readable by every viewer,
 * and a default of "deny" would instead break every read the day
 * somebody adds one.
 */
export const CAPABILITY_FOR_ACTION: Partial<Record<ClientAction, Capability>> =
	{
		"connection.create": "datasource.manage",
		"connection.update": "datasource.manage",
		"connection.delete": "datasource.manage",
		"connection.test": "datasource.manage",
		"datasource.set-paths": "datasource.manage",
		"datasource.check-path": "datasource.manage",
		"datasource.export-config": "datasource.manage",
		"domain.set-export-path": "datasource.manage",
		"git.datasource.set-options": "datasource.manage",

		"document.create": "document.write",
		"document.save": "document.write",
		"document.archive": "document.write",
		"file.open": "document.write",
		"workspace.set-default-connection": "document.write",

		"execution.start": "query.run",
		"execution.cancel": "query.run",
		"table.mutate": "data.write",
		"object.alter": "schema.change",

		"gripe.dismiss": "gripe.dismiss",
		"gripe.restore": "gripe.dismiss",

		"domain.upsert": "domain.manage",
		"domain.delete": "domain.manage",
		"domain.tag": "domain.manage",

		"access.roles.set": "access.manage",

		"git.status": "git.commit",
		"git.stage": "git.commit",
		"git.commit": "git.commit",
		"git.pull": "git.commit",
		"git.datasource.reload": "git.commit",

		"git.push": "git.push",
		"git.datasource.add": "git.push",
		"git.datasource.remove": "git.push",

		"domain.export": "sync.run",
		"domain.import": "sync.run",
		"domain.git": "sync.run",

		"repo.trust": "repo.commands",
		"repo.run": "repo.commands",
		"repo.run.cancel": "repo.commands",

		"mcp.status": "mcp.manage",
		"mcp.settings": "mcp.manage",
		"mcp.settings.set": "mcp.manage",
		"mcp.token.create": "mcp.manage",
		"mcp.token.revoke": "mcp.manage",

		"workspace.member.add": "members.manage",
		"workspace.member.remove": "members.manage",
		"role.upsert": "members.manage",
		"role.delete": "members.manage",
		"member.set-role": "members.manage",

		"workspace.rename": "project.manage",
		"workspace.delete": "project.manage",
		"app.restart": "server.restart",
	};

/**
 * A `text[]` literal.
 *
 * The driver serializes an empty JS array as `''`, which PostgreSQL
 * reads as a malformed array — and the viewer role's capabilities are
 * empty by definition, so this is not an edge case, it is the first
 * row inserted. Capability names are an enum of dotted words, so
 * nothing here needs quoting.
 */
export function capabilityArray(values: readonly string[]): string {
	return `{${values.join(",")}}`;
}

/** Anything the database kept that is no longer a capability is dropped. */
function known(values: readonly string[]): Capability[] {
	const set = new Set<string>(CAPABILITIES);
	return values.filter((value): value is Capability => set.has(value));
}

interface MemberRow {
	role: BuiltinRole;
	capabilities: string[] | null;
	role_name: string | null;
}

/**
 * The capabilities a member holds in a project, and the name of the role
 * they hold them through.
 *
 * The rank is the fallback, for the window between a server that knows
 * about roles and a database that has not been migrated yet — and for
 * the direct-in shape, which has one person and no membership rows at
 * all.
 */
export async function membershipFor(
	appDb: AppDb,
	workspaceId: string,
	userId: string,
): Promise<{ role: string; capabilities: Capability[] } | null> {
	const rows = await appDb<MemberRow[]>`
		SELECT m.role, r.capabilities, r.name AS role_name
		FROM workspace_members m
		LEFT JOIN workspace_roles r ON r.id = m.role_id
		WHERE m.workspace_id = ${workspaceId} AND m.user_id = ${userId}
	`;
	const row = rows[0];
	if (row === undefined) {
		return null;
	}
	return {
		role: row.role_name ?? row.role,
		capabilities:
			row.capabilities === null
				? BUILTIN_ROLE_CAPABILITIES[row.role]
				: known(row.capabilities),
	};
}

/**
 * Every role in a project, with the members holding each. Seeds the
 * three built-ins first: a project created before this existed has
 * none, and the alternative is a settings page that says a project has
 * no roles while everybody in it clearly has one.
 */
export async function listRoles(
	appDb: AppDb,
	workspaceId: string,
): Promise<WorkspaceRoleEntry[]> {
	await seedBuiltinRoles(appDb, workspaceId);
	const rows = await appDb<
		Array<{
			id: string;
			name: string;
			capabilities: string[];
			builtin: BuiltinRole | null;
			members: string;
		}>
	>`
		SELECT r.id, r.name, r.capabilities, r.builtin,
		       (SELECT count(*) FROM workspace_members m WHERE m.role_id = r.id)
		         AS members
		FROM workspace_roles r
		WHERE r.workspace_id = ${workspaceId}
		ORDER BY
			CASE r.builtin
				WHEN 'owner' THEN 0
				WHEN 'editor' THEN 1
				WHEN 'viewer' THEN 2
				ELSE 3
			END,
			r.name
	`;
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		capabilities: known(row.capabilities),
		builtin: row.builtin,
		members: Number(row.members),
	}));
}

/**
 * The three every project has. Idempotent, and called both when a
 * project is created and the first time anybody reads its roles.
 */
export async function seedBuiltinRoles(
	appDb: AppDb,
	workspaceId: string,
): Promise<void> {
	for (const builtin of ["viewer", "editor", "owner"] as BuiltinRole[]) {
		await appDb`
			INSERT INTO workspace_roles (workspace_id, name, capabilities, builtin)
			VALUES (
				${workspaceId},
				${builtin},
				${capabilityArray(BUILTIN_ROLE_CAPABILITIES[builtin])}::text[],
				${builtin}
			)
			ON CONFLICT DO NOTHING
		`;
	}
	// Members who predate the roles table point at the built-in matching
	// the rank they already hold, so nothing about what they may do moves.
	await appDb`
		UPDATE workspace_members m
		SET role_id = r.id
		FROM workspace_roles r
		WHERE r.workspace_id = m.workspace_id
			AND r.builtin = m.role
			AND m.workspace_id = ${workspaceId}
			AND m.role_id IS NULL
	`;
}

/**
 * Whether moving one member to one role would leave the project with
 * nobody who can administer it.
 *
 * The old rule was "you cannot remove the last owner", which a matrix
 * turns into something slightly different and more useful: somebody has
 * to keep `members.manage`, or the project can never be given back its
 * roles — and the only way out would be a database session.
 */
export async function wouldStrandProject(
	appDb: AppDb,
	workspaceId: string,
	userId: string,
	newRoleId: string,
): Promise<boolean> {
	const rows = await appDb<
		Array<{ user_id: string; role: BuiltinRole; capabilities: string[] | null }>
	>`
		SELECT m.user_id, m.role, r.capabilities
		FROM workspace_members m
		LEFT JOIN workspace_roles r ON r.id = m.role_id
		WHERE m.workspace_id = ${workspaceId}
	`;
	const newRole = await appDb<Array<{ capabilities: string[] }>>`
		SELECT capabilities FROM workspace_roles
		WHERE id = ${newRoleId} AND workspace_id = ${workspaceId}
	`;
	const holds = (capabilities: readonly string[]) =>
		capabilities.includes("members.manage");
	const after = rows.filter((row) =>
		row.user_id === userId
			? holds(newRole[0]?.capabilities ?? [])
			: holds(row.capabilities ?? BUILTIN_ROLE_CAPABILITIES[row.role]),
	);
	return after.length === 0;
}
