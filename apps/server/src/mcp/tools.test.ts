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
