import { describe, expect, test } from "bun:test";
import type { McpContext, McpDeps } from "./context";
import { callTool, toolDefinitions } from "./tools";

const context: McpContext = {
	workspace: { id: "project", name: "Project", defaultConnectionRef: null },
	userId: "user",
	token: { id: "token", name: "test" },
	role: "editor",
	capabilities: ["domain.manage", "sync.run", "git.commit", "git.push"],
	mode: "read-write",
};
const writes = [
	[
		"sync_datasource",
		"syncEnabled",
		{ connectionRef: "db", dryRun: false, idempotencyKey: "sync-key" },
	],
	[
		"git_commit",
		"gitEnabled",
		{
			connectionRef: "db",
			message: "snapshot",
			paths: [],
			idempotencyKey: "commit-key",
		},
	],
	[
		"git_push",
		"gitEnabled",
		{ connectionRef: "db", idempotencyKey: "push-key" },
	],
	[
		"upsert_domain",
		"domainsEnabled",
		{
			connectionRef: "db",
			name: "billing",
			colour: 1,
			idempotencyKey: "domain-key",
		},
	],
	[
		"delete_domain",
		"domainsEnabled",
		{
			connectionRef: "db",
			id: "00000000-0000-4000-8000-000000000001",
			idempotencyKey: "delete-key",
		},
	],
	[
		"tag_objects",
		"domainsEnabled",
		{
			connectionRef: "db",
			domainId: null,
			targets: [{ schema: "public", name: "payments", kind: "table" }],
			idempotencyKey: "tagging-key",
		},
	],
	[
		"git_pull",
		"gitEnabled",
		{ connectionRef: "db", idempotencyKey: "pull-key" },
	],
] as const;

describe("MCP functionality gates precede all service calls", () => {
	for (const [name, setting, args] of writes) {
		test(`${name} requires its opt-in, write mode and editor role`, async () => {
			// An empty dependency set makes touching any service before authorization fail.
			const deps = {} as McpDeps;
			await expect(callTool(deps, context, name, args)).rejects.toThrow(
				"disabled",
			);
			await expect(
				callTool(
					deps,
					{ ...context, [setting]: true, mode: "read-only" },
					name,
					args,
				),
			).rejects.toThrow("read/write mode and editor");
			await expect(
				callTool(
					deps,
					{ ...context, [setting]: true, role: "viewer" },
					name,
					args,
				),
			).rejects.toThrow("read/write mode and editor");
		});
	}
	test("Git deployment switch still applies after project opt-in", async () => {
		await expect(
			callTool(
				{ config: { GIT_ENABLED: false } } as McpDeps,
				{ ...context, gitEnabled: true },
				"git_push",
				writes[2][2],
			),
		).rejects.toThrow("disabled for this deployment");
	});
	test("domain management refuses a datasource outside the project before writing", async () => {
		const deps = {
			connections: { listConnections: async () => [] },
		} as unknown as McpDeps;
		await expect(
			callTool(
				deps,
				{ ...context, domainsEnabled: true },
				"upsert_domain",
				writes[3][2],
			),
		).rejects.toThrow("No datasource");
	});
	test("tool schema makes sync preview the default", () => {
		const tool = toolDefinitions().find(
			(entry) => entry.name === "sync_datasource",
		);
		expect(tool?.inputSchema).toMatchObject({
			properties: { dryRun: { default: true } },
		});
	});
});

test("custom roles cannot regain a denied push through MCP", async () => {
	await expect(
		callTool(
			{} as McpDeps,
			{ ...context, gitEnabled: true, capabilities: ["git.commit"] },
			"git_push",
			writes[2][2],
		),
	).rejects.toThrow("requires git.push");
});

test("MCP commits selected files and pushes only on the separate call", async () => {
	const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
	const root = await mkdtemp("/tmp/dg-mcp-git-");
	const git = async (...args: string[]) => {
		const child = Bun.spawn(["git", ...args], {
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [out, err, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (code !== 0) throw new Error(err);
		return out.trim();
	};
	try {
		await git("init", "--initial-branch=main");
		await git("config", "user.name", "MCP test");
		await git("config", "user.email", "mcp@example.com");
		await git("init", "--bare", "remote.git");
		await git("remote", "add", "origin", `${root}/remote.git`);
		await writeFile(`${root}/snapshot.sql`, "select 1;\n");
		await writeFile(`${root}/unrelated.sql`, "select 2;\n");
		const responses = new Map<string, unknown>();
		const appDb = async (
			strings: TemplateStringsArray,
			...values: unknown[]
		) => {
			const key = `${values[1]}:${values[2]}`;
			if (strings.join("").includes("SELECT response"))
				return responses.has(key) ? [{ response: responses.get(key) }] : [];
			responses.set(key, values[3]);
			return [];
		};
		const deps = {
			appDb,
			config: { GIT_ENABLED: true, GIT_TIMEOUT_MS: 20_000 },
			gitDatasources: {
				entryFor: async (workspace: string, ref: string) =>
					workspace === "project" && ref === "git:test"
						? { repoPath: root }
						: null,
			},
		} as unknown as McpDeps;
		const ctx = { ...context, gitEnabled: true };
		const request = {
			connectionRef: "git:test",
			message: "snapshot",
			paths: ["snapshot.sql"],
			idempotencyKey: "commit-once",
		};
		expect(await callTool(deps, ctx, "git_commit", request)).toMatchObject({
			exitCode: 0,
		});
		expect(await callTool(deps, ctx, "git_commit", request)).toMatchObject({
			exitCode: 0,
		});
		expect(await git("rev-list", "--count", "HEAD")).toBe("1");
		expect(await git("ls-tree", "--name-only", "HEAD")).toBe("snapshot.sql");
		expect(
			await git("--git-dir=remote.git", "for-each-ref", "refs/heads"),
		).toBe("");
		expect(
			await callTool(deps, ctx, "git_push", {
				connectionRef: "git:test",
				setUpstream: true,
				idempotencyKey: "push-once",
			}),
		).toMatchObject({ exitCode: 0 });
		expect(
			await git("--git-dir=remote.git", "rev-parse", "refs/heads/main"),
		).toBe(await git("rev-parse", "HEAD"));
		await expect(
			callTool(deps, ctx, "git_status", { connectionRef: "git:other-project" }),
		).rejects.toThrow("No repository datasource");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

/**
 * The bug report this exists for: the repository is shared with people
 * pushing `migrations/` from their own checkouts, so the server's clone
 * falls behind between one export and the next, and the agent — which
 * has no terminal — had its push rejected until somebody logged in and
 * rebased by hand.
 */
test("MCP keeps a shared repository's clone pushable", async () => {
	const { mkdir, mkdtemp, readFile, writeFile, rm } = await import(
		"node:fs/promises"
	);
	const base = await mkdtemp("/tmp/dg-mcp-shared-");
	const origin = `${base}/origin.git`;
	const clone = `${base}/clone`;
	const human = `${base}/human`;
	const git = async (cwd: string, ...args: string[]) => {
		const child = Bun.spawn(["git", ...args], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [out, err, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (code !== 0) throw new Error(err);
		return out.trim();
	};
	const identify = async (cwd: string) => {
		await git(cwd, "config", "user.name", "MCP test");
		await git(cwd, "config", "user.email", "mcp@example.com");
	};
	/** A developer's checkout: pull, write one file, commit, push. */
	const humanPushes = async (file: string, content: string) => {
		await git(human, "pull", "--ff-only");
		await mkdir(`${human}/${file.split("/").slice(0, -1).join("/")}`, {
			recursive: true,
		});
		await writeFile(`${human}/${file}`, content);
		await git(human, "add", "--", file);
		await git(human, "commit", "-m", `human: ${file}`);
		await git(human, "push");
	};
	try {
		await git(base, "init", "--bare", "--initial-branch=main", origin);
		await git(base, "clone", origin, human);
		await identify(human);
		await writeFile(`${human}/schema.sql`, "-- v1\n");
		await git(human, "add", ".");
		await git(human, "commit", "-m", "initial");
		await git(human, "push", "-u", "origin", "main");
		await git(base, "clone", origin, clone);
		await identify(clone);

		const changed: unknown[] = [];
		const deps = {
			// No idempotency row is ever found, and no document is dirty.
			appDb: async () => [],
			config: { GIT_ENABLED: true, GIT_TIMEOUT_MS: 20_000 },
			gitDatasources: {
				entryFor: async (_workspace: string, ref: string) =>
					ref === "git:shared" ? { repoPath: clone } : null,
				invalidate: () => {},
			},
			onRepoChanged: (_workspace: string, payload: unknown) =>
				changed.push(payload),
		} as unknown as McpDeps;
		const ctx = { ...context, gitEnabled: true };
		const ref = { connectionRef: "git:shared" };
		const exportAndCommit = async (content: string, key: string) => {
			await writeFile(`${clone}/schema.sql`, content);
			return callTool(deps, ctx, "git_commit", {
				...ref,
				message: "schema",
				paths: ["schema.sql"],
				idempotencyKey: `commit-${key}`,
			});
		};

		// git_status fetches, so "behind" is the remote's truth and not
		// the last fetch's memory.
		await humanPushes("migrations/001.sql", "create table a ();\n");
		expect(await callTool(deps, ctx, "git_status", ref)).toMatchObject({
			ahead: 0,
			behind: 1,
		});

		// Remote moved on disjoint paths → the push rebases and lands.
		await exportAndCommit("-- v2\n", "1");
		await humanPushes("migrations/002.sql", "create table b ();\n");
		expect(
			await callTool(deps, ctx, "git_push", {
				...ref,
				idempotencyKey: "push-first",
			}),
		).toMatchObject({
			exitCode: 0,
			headMoved: true,
			changedPaths: ["migrations/001.sql", "migrations/002.sql"],
		});
		expect(await git(origin, "rev-parse", "main")).toBe(
			await git(clone, "rev-parse", "HEAD"),
		);
		expect(await git(origin, "ls-tree", "-r", "--name-only", "main")).toBe(
			"migrations/001.sql\nmigrations/002.sql\nschema.sql",
		);
		expect(changed).toEqual([
			{
				connectionRef: "git:shared",
				changedPaths: ["migrations/001.sql", "migrations/002.sql"],
				configChanged: false,
			},
		]);

		// git_pull on its own does the same without pushing.
		await humanPushes("migrations/003.sql", "create table c ();\n");
		expect(
			await callTool(deps, ctx, "git_pull", {
				...ref,
				idempotencyKey: "pull-first",
			}),
		).toMatchObject({ headMoved: true, changedPaths: ["migrations/003.sql"] });

		// A real conflict refuses, pushes nothing and leaves the clone as
		// it was: committed, one ahead, one behind, clean.
		await exportAndCommit("-- v3 from DataGripe\n", "2");
		await humanPushes("schema.sql", "-- v3 by hand\n");
		const remoteBefore = await git(origin, "rev-parse", "main");
		const localBefore = await git(clone, "rev-parse", "HEAD");
		await expect(
			callTool(deps, ctx, "git_push", {
				...ref,
				idempotencyKey: "push-second",
			}),
		).rejects.toThrow("rebase was aborted");
		expect(await git(origin, "rev-parse", "main")).toBe(remoteBefore);
		expect(await git(clone, "rev-parse", "HEAD")).toBe(localBefore);
		expect(await readFile(`${clone}/schema.sql`, "utf8")).toBe(
			"-- v3 from DataGripe\n",
		);
		expect(await callTool(deps, ctx, "git_status", ref)).toMatchObject({
			ahead: 1,
			behind: 1,
			entries: [],
		});
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("git_status reports a failed fetch beside the local status", async () => {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const root = await mkdtemp("/tmp/dg-mcp-nofetch-");
	try {
		const run = async (...args: string[]) =>
			Bun.spawn(["git", ...args], { cwd: root, stderr: "pipe" }).exited;
		await run("init", "--initial-branch=main");
		await run("remote", "add", "origin", `${root}/does-not-exist.git`);
		const deps = {
			config: { GIT_ENABLED: true, GIT_TIMEOUT_MS: 20_000 },
			gitDatasources: { entryFor: async () => ({ repoPath: root }) },
		} as unknown as McpDeps;
		const result = (await callTool(
			deps,
			{ ...context, gitEnabled: true },
			"git_status",
			{ connectionRef: "git:any" },
		)) as { entries: unknown[]; fetchError?: string };
		expect(result.entries).toEqual([]);
		expect(result.fetchError).toContain("does-not-exist.git");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
