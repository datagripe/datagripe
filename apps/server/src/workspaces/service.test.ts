import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createAccount } from "../auth/accounts";
import { migrate } from "../db/app/migrate";
import type { AppDb } from "../db/app/pool";
import {
	createWorkspace,
	deleteWorkspace,
	listWorkspaces,
	setDefaultConnection,
} from "./service";

/** Workspace lifecycle integration test against a real app database. */

const ADMIN_URL = "postgres://datagripe:datagripe@localhost:5432/postgres";
const SCRATCH_DB = "datagripe_workspaces_test";

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
let userId: string;

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
	await appDb.unsafe("TRUNCATE workspace_members, workspaces, users CASCADE");
	userId = (await createAccount(appDb, "ws@example.com", "hash")).userId;
});

afterAll(async () => {
	await appDb?.close();
});

describe("workspace service", () => {
	pgTest(
		"create adds an owner membership; list returns all memberships",
		async () => {
			const initial = await listWorkspaces(appDb, userId);
			expect(initial).toHaveLength(1); // default "Local" from createAccount

			const created = await createWorkspace(appDb, userId, "Analytics");
			expect(created).toMatchObject({ name: "Analytics", role: "owner" });

			const after = await listWorkspaces(appDb, userId);
			expect(after).toHaveLength(2);
			expect(after.map((w) => w.name)).toContain("Analytics");
		},
	);

	pgTest("set-default-connection validates the ref", async () => {
		const [workspace] = await listWorkspaces(appDb, userId);
		if (workspace === undefined) {
			throw new Error("expected a workspace");
		}
		const workspaceId = workspace.id;
		await setDefaultConnection(
			appDb,
			workspaceId,
			"predefined:local-demo",
			async () => true,
		);
		const rows = await appDb<{ default_connection_ref: string | null }[]>`
			SELECT default_connection_ref FROM workspaces WHERE id = ${workspaceId}
		`;
		expect(rows[0]?.default_connection_ref).toBe("predefined:local-demo");

		await expect(
			setDefaultConnection(appDb, workspaceId, "bogus", async () => false),
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		await setDefaultConnection(appDb, workspaceId, null, async () => false);
		const cleared = await appDb<{ default_connection_ref: string | null }[]>`
			SELECT default_connection_ref FROM workspaces WHERE id = ${workspaceId}
		`;
		expect(cleared[0]?.default_connection_ref).toBeNull();
	});
});

describe("deleting a project", () => {
	pgTest("takes everything that belonged to it with it", async () => {
		const doomed = await createWorkspace(appDb, userId, "Doomed");
		// One row in a table that hangs off the project, and one in a
		// table that hangs off a row that hangs off it: the cascade is the
		// schema's, so this is checking the schema, not a list in the
		// service.
		await appDb`
			INSERT INTO documents (workspace_id, title, content)
			VALUES (${doomed.id}, 'notes', 'select 1')
		`;
		await appDb`
			INSERT INTO gripe_dismissals
				(workspace_id, rule_id, scope, key, dismissed_by)
			VALUES (${doomed.id}, 'pk.missing', 'project', '', ${userId})
		`;

		await deleteWorkspace(appDb, doomed.id, userId);

		for (const table of [
			"documents",
			"gripe_dismissals",
			"workspace_members",
			"workspace_roles",
		]) {
			const rows = await appDb.unsafe(
				`SELECT count(*)::int AS count FROM ${table} WHERE workspace_id = $1`,
				[doomed.id],
			);
			expect(rows[0]?.count).toBe(0);
		}
		expect(
			(await listWorkspaces(appDb, userId)).map((w) => w.id),
		).not.toContain(doomed.id);
	});

	pgTest("refuses the only project the account has", async () => {
		const solo = (await createAccount(appDb, "solo@example.com", "hash"))
			.userId;
		const [only] = await listWorkspaces(appDb, solo);
		if (only === undefined) {
			throw new Error("expected a default workspace");
		}
		await expect(deleteWorkspace(appDb, only.id, solo)).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});

	pgTest("refuses to lock another member out", async () => {
		const shared = await createWorkspace(appDb, userId, "Shared");
		const guest = await createAccount(appDb, "guest@example.com", "hash");
		// A member whose only project is this one: deleting it would leave
		// them with no workspace, and a session with no workspace cannot
		// open a socket at all.
		await appDb`DELETE FROM workspaces WHERE id = ${guest.workspaceId}`;
		await appDb`
			INSERT INTO workspace_members (workspace_id, user_id, role)
			VALUES (${shared.id}, ${guest.userId}, 'viewer')
		`;

		await expect(
			deleteWorkspace(appDb, shared.id, userId),
		).rejects.toMatchObject({ code: "CONFLICT" });

		// Removed, the project goes.
		await appDb`
			DELETE FROM workspace_members
			WHERE workspace_id = ${shared.id} AND user_id = ${guest.userId}
		`;
		await deleteWorkspace(appDb, shared.id, userId);
		expect(
			(await listWorkspaces(appDb, userId)).map((w) => w.name),
		).not.toContain("Shared");
	});
});
