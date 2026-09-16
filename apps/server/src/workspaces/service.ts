import type { BuiltinRole, WorkspaceListEntry } from "@datagripe/contracts";
import { BUILTIN_ROLE_CAPABILITIES } from "@datagripe/contracts";
import { ErrorCodes } from "@datagripe/contracts/errors";
import { ServiceError } from "../connections/service";
import type { AppDb } from "../db/app/pool";
import { log } from "../log";
import { capabilityArray } from "../permissions";

/** Workspace lifecycle (workspaces are the project unit). */

export async function createWorkspace(
	appDb: AppDb,
	userId: string,
	name: string,
): Promise<WorkspaceListEntry> {
	return appDb.begin(async (tx) => {
		const rows = await tx<{ id: string }[]>`
			INSERT INTO workspaces (owner_id, name) VALUES (${userId}, ${name})
			RETURNING id
		`;
		const workspace = rows[0];
		if (workspace === undefined) {
			throw new ServiceError(ErrorCodes.Internal, "Insert returned no row");
		}
		// The three roles, and the creator in the one that can do
		// everything (docs/spec/permissions.md). Seeded here rather than
		// lazily so a project always has them, including in the same
		// transaction that made it.
		for (const builtin of ["viewer", "editor", "owner"] as BuiltinRole[]) {
			await tx`
				INSERT INTO workspace_roles (workspace_id, name, capabilities, builtin)
				VALUES (
					${workspace.id},
					${builtin},
					${capabilityArray(BUILTIN_ROLE_CAPABILITIES[builtin])}::text[],
					${builtin}
				)
			`;
		}
		await tx`
			INSERT INTO workspace_members (workspace_id, user_id, role, role_id)
			VALUES (
				${workspace.id},
				${userId},
				'owner',
				(SELECT id FROM workspace_roles
				  WHERE workspace_id = ${workspace.id} AND builtin = 'owner')
			)
		`;
		log.audit("workspace.create", { workspaceId: workspace.id, userId });
		return { id: workspace.id, name, role: "owner" };
	});
}

export async function listWorkspaces(
	appDb: AppDb,
	userId: string,
): Promise<WorkspaceListEntry[]> {
	const rows = await appDb<
		Array<{ id: string; name: string; role: "owner" | "editor" | "viewer" }>
	>`
		SELECT w.id, w.name, m.role
		FROM workspace_members m
		JOIN workspaces w ON w.id = m.workspace_id
		WHERE m.user_id = ${userId}
		ORDER BY w.created_at
	`;
	return rows;
}

export async function renameWorkspace(
	appDb: AppDb,
	workspaceId: string,
	name: string,
): Promise<void> {
	await appDb`
		UPDATE workspaces SET name = ${name}
		WHERE id = ${workspaceId}
	`;
	log.audit("workspace.rename", { workspaceId, name });
}

/**
 * Delete a project and everything the system knows about it.
 *
 * The cascade is the schema's, not a list kept here: every table that
 * belongs to a project references `workspaces (id) ON DELETE CASCADE`,
 * so members, roles, datasources and their secrets, documents, domains
 * and their run history, dismissals, layouts, paths, MCP settings and
 * tokens all go in one statement. A list in this function would be the
 * second place to remember, and the one that gets forgotten.
 *
 * **Nothing on disk is touched.** A repository datasource's checkout, a
 * domain's export directory and any file opened through a datasource
 * path are the host's, not the project's — DataGripe stops knowing
 * about them, which is what deleting the project means. Removing them
 * would delete work that lives in somebody's git repository.
 *
 * One rule stops it: **nobody may be left without a project.** A
 * session whose account has no workspace cannot open a socket at all
 * ("Account has no workspace"), so deleting the last one locks that
 * person out of the application rather than returning them to it — and
 * that is as true for the other members of a shared project as it is
 * for the person pressing the button.
 */
export async function deleteWorkspace(
	appDb: AppDb,
	workspaceId: string,
	userId: string,
): Promise<void> {
	const stranded = await appDb<{ user_id: string; email: string }[]>`
		SELECT m.user_id, u.email
		FROM workspace_members m
		JOIN users u ON u.id = m.user_id
		WHERE m.workspace_id = ${workspaceId}
			AND NOT EXISTS (
				SELECT 1 FROM workspace_members other
				WHERE other.user_id = m.user_id
					AND other.workspace_id <> ${workspaceId}
			)
		ORDER BY (m.user_id = ${userId}) DESC, u.email
	`;
	const first = stranded[0];
	if (first !== undefined) {
		throw new ServiceError(
			ErrorCodes.Conflict,
			first.user_id === userId
				? "This is your only project — create another one before deleting it"
				: `${first.email} has no other project and would be locked out — remove them from this one first`,
		);
	}
	const rows = await appDb<{ id: string }[]>`
		DELETE FROM workspaces WHERE id = ${workspaceId} RETURNING id
	`;
	if (rows[0] === undefined) {
		throw new ServiceError(ErrorCodes.NotFound, "Project not found");
	}
	log.audit("workspace.delete", { workspaceId, userId });
}

export async function setDefaultConnection(
	appDb: AppDb,
	workspaceId: string,
	connectionRef: string | null,
	isKnownRef: (ref: string) => Promise<boolean>,
): Promise<void> {
	if (connectionRef !== null && !(await isKnownRef(connectionRef))) {
		throw new ServiceError(
			ErrorCodes.NotFound,
			`Connection '${connectionRef}' not found in this workspace`,
		);
	}
	await appDb`
		UPDATE workspaces SET default_connection_ref = ${connectionRef}
		WHERE id = ${workspaceId}
	`;
	log.audit("workspace.set-default-connection", {
		workspaceId,
		connectionRef,
	});
}
