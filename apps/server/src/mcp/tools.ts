import {
	BUILTIN_ROLE_CAPABILITIES,
	type Capability,
	domainDeleteRequestSchema,
	domainExportRequestSchema,
	domainListRequestSchema,
	domainTagRequestSchema,
	domainUpsertRequestSchema,
	gitCommitRequestSchema,
	gitPushRequestSchema,
} from "@datagripe/contracts";
import { ErrorCodes } from "@datagripe/contracts/errors";
import { asSqlDialect } from "@datagripe/sql-tools";
import { z } from "zod";
import { ServiceError } from "../connections/service";
import { withIdempotency } from "../db/app/idempotency";
import { runExport } from "../domains/export";
import {
	deleteDomain,
	listDomains,
	tag,
	upsertDomain,
} from "../domains/service";
import * as gitRepo from "../git/repo";
import { type McpContext, type McpDeps, requireCommitRole } from "./context";
import {
	capabilitiesOf,
	datasources,
	domainMap,
	listExposedFiles,
	readExposed,
	requireUsable,
	resolveDatasource,
	searchExposed,
} from "./knowledge";
import { refusalMessage, refuseWrites } from "./readonly";

/**
 * The tool set (docs/spec/mcp.md "Tools").
 *
 * Tools use flat `snake_case` names, and no tool that takes a project
 * argument — the project is the endpoint. A list an agent can hold in
 * its head beats a complete one: the WebSocket protocol has sixty-odd
 * actions and most of them are UI state.
 */

const datasourceArg = z
	.string()
	.max(255)
	.optional()
	.describe(
		"Datasource ref or name from describe_project. Omit to use the project's default.",
	);

const OBJECT_CATEGORIES = [
	"tables",
	"views",
	"functions",
	"procedures",
	"sequences",
] as const;

const schemas = {
	list_domains: domainListRequestSchema,
	upsert_domain: domainUpsertRequestSchema,
	delete_domain: domainDeleteRequestSchema.extend({
		idempotencyKey: z.string().min(8).max(128),
	}),
	tag_objects: domainTagRequestSchema,
	sync_datasource: domainExportRequestSchema,
	git_status: z.object({ connectionRef: z.string().min(1).max(255) }),
	git_commit: gitCommitRequestSchema,
	git_push: gitPushRequestSchema,
	describe_project: z.object({}),
	describe_domain: z.object({
		name: z
			.string()
			.min(1)
			.max(120)
			.describe("Domain name from describe_project."),
		datasource: datasourceArg,
	}),
	list_docs: z.object({
		datasource: datasourceArg,
		query: z
			.string()
			.max(200)
			.optional()
			.describe("Only list files whose path contains this text."),
	}),
	read_doc: z.object({
		uri: z
			.string()
			.min(1)
			.max(2048)
			.describe("A datagripe:// uri from describe_project or list_docs."),
		offset: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe(
				"Pass the nextOffset from a truncated read to continue where it stopped.",
			),
	}),
	search_docs: z.object({
		text: z.string().min(2).max(200).describe("Case-insensitive substring."),
		max: z.number().int().min(1).max(200).optional(),
	}),
	list_schemas: z.object({ datasource: datasourceArg }),
	list_objects: z.object({
		datasource: datasourceArg,
		schema: z.string().min(1).max(255),
		kind: z.enum(OBJECT_CATEGORIES).optional(),
	}),
	describe_object: z.object({
		datasource: datasourceArg,
		schema: z.string().min(1).max(255),
		name: z
			.string()
			.min(1)
			.max(1024)
			.describe(
				"As list_objects shows it — a PostgreSQL routine's name carries its argument types.",
			),
		kind: z
			.enum(["table", "view", "function", "procedure", "sequence"])
			.optional(),
	}),
	run_query: z.object({
		datasource: datasourceArg,
		sql: z.string().min(1).max(100_000),
		maxRows: z
			.number()
			.int()
			.min(1)
			.optional()
			.describe("Clamped to the server's own cap, never above it."),
	}),
} as const;

export type ToolName = keyof typeof schemas;

const DESCRIPTIONS: Record<ToolName, string> = {
	list_domains:
		"List all domains including hidden domains, their sync settings and object assignments.",
	upsert_domain:
		"Create a domain, or replace its settings by id. Read list_domains first and preserve settings you want to keep. includeData exports table data; hidden excludes the domain from sync. Reuse idempotencyKey for retries.",
	delete_domain:
		"Delete a domain and its assignments, not database objects. Reuse idempotencyKey for retries.",
	tag_objects:
		"Assign objects to a domain, moving any previous assignment. domainId null removes assignments. Reuse idempotencyKey for retries.",
	sync_datasource:
		"Export the configured datasource snapshot to files. Defaults to dryRun for preview; pass dryRun false to apply. Does not pull Git changes. Reuse the idempotencyKey when retrying an apply.",
	git_status: "Read the datasource repository status before committing.",
	git_commit:
		"Stage named paths, then commit all staged changes, including previously staged files. Empty paths commits the existing index. Inspect git_status first. Reuse idempotencyKey for retries.",
	git_push:
		"Push the current branch, never force. Separate from commit. Reuse idempotencyKey for retries.",
	describe_project:
		"Start here. The project's datasources, its domain map (which database objects belong to which part of the product) and an index of its own documentation. The domain map and the documents hold knowledge the schema does not: read them before inferring meaning from table and column names.",
	describe_domain:
		"One domain's description and the objects tagged into it, for a project too large to inline in describe_project.",
	list_docs:
		"The project's readable files: workspace documents plus every file under a datasource's configured paths (runbooks, migrations, saved queries).",
	read_doc:
		"Read one document or file verbatim, markdown source included. Large files come back in pieces — pass the returned nextOffset to continue.",
	search_docs:
		"Case-insensitive substring search across every readable file. Use it to find where a table, column or convention is explained.",
	list_schemas: "The datasource's schemas (or databases, or attached files).",
	list_objects: "Tables, views, routines or sequences in one schema.",
	describe_object:
		"Everything about one object in one call: columns, keys, indexes, constraints, triggers, grants and DDL.",
	run_query:
		"Run SQL against a datasource. Results are capped for a context window, so aggregate or add LIMIT rather than selecting whole tables.",
};

export interface ToolDefinition {
	name: ToolName;
	description: string;
	inputSchema: unknown;
}

/** `tools/list`, generated from the schemas so the two cannot diverge. */
export function toolDefinitions(): ToolDefinition[] {
	return (Object.keys(schemas) as ToolName[]).map((name) => ({
		name,
		description: DESCRIPTIONS[name],
		inputSchema: z.toJSONSchema(schemas[name]),
	}));
}

export function isToolName(value: string): value is ToolName {
	return Object.hasOwn(schemas, value);
}

/**
 * Run one tool and return its payload. Refusals throw `ServiceError`;
 * the route turns those into a tool error the model can read and act
 * on, rather than a transport failure the client reports as broken.
 */
export async function callTool(
	deps: McpDeps,
	ctx: McpContext,
	name: ToolName,
	rawArgs: unknown,
): Promise<unknown> {
	const parsed = schemas[name].safeParse(rawArgs ?? {});
	if (!parsed.success) {
		throw new ServiceError(
			ErrorCodes.BadRequest,
			`Bad arguments for ${name}: ${parsed.error.issues
				.map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
				.join("; ")}`,
		);
	}
	const args = parsed.data as Record<string, unknown>;
	const required: Partial<Record<ToolName, Capability>> = {
		upsert_domain: "domain.manage",
		delete_domain: "domain.manage",
		tag_objects: "domain.manage",
		sync_datasource: "sync.run",
		git_status: "git.commit",
		git_commit: "git.commit",
		git_push: "git.push",
	};
	const capability = required[name];
	if (
		capability &&
		!(ctx.capabilities ?? BUILTIN_ROLE_CAPABILITIES[ctx.role]).includes(
			capability,
		)
	) {
		throw new ServiceError(
			ErrorCodes.Forbidden,
			`This operation requires ${capability}; writes also require read/write mode and editor access`,
		);
	}

	switch (name) {
		case "list_domains":
		case "upsert_domain":
		case "delete_domain":
		case "tag_objects": {
			requireFunctionality(ctx, "domainsEnabled", name !== "list_domains");
			const datasource = await resolveDatasource(
				deps,
				ctx,
				args.connectionRef as string,
			);
			const scoped = { ...args, connectionRef: datasource.id };
			if (name === "list_domains")
				return listDomains(deps.appDb, ctx.workspace.id, datasource.id);
			return withIdempotency(
				deps.appDb,
				ctx.workspace.id,
				`mcp.${name}`,
				args.idempotencyKey as string,
				async () => {
					if (name === "upsert_domain")
						return upsertDomain(
							deps.appDb,
							ctx.workspace.id,
							domainUpsertRequestSchema.parse(scoped),
						);
					if (name === "delete_domain")
						return deleteDomain(
							deps.appDb,
							ctx.workspace.id,
							domainDeleteRequestSchema.parse(scoped),
						);
					return tag(
						deps.appDb,
						ctx.workspace.id,
						ctx.userId,
						domainTagRequestSchema.parse(scoped),
					);
				},
			);
		}
		case "sync_datasource": {
			requireFunctionality(ctx, "syncEnabled", args.dryRun !== true);
			const datasource = await resolveDatasource(
				deps,
				ctx,
				args.connectionRef as string,
			);
			const request = domainExportRequestSchema.parse({
				...args,
				connectionRef: datasource.id,
			});
			const run = () =>
				runExport(
					{
						...deps,
						maxDataRows: deps.config.DOMAIN_EXPORT_MAX_DATA_ROWS,
						maxCells: deps.config.ACCESS_REPORT_MAX_CELLS,
					},
					ctx.workspace,
					ctx.userId,
					request,
				);
			return request.dryRun
				? run()
				: withIdempotency(
						deps.appDb,
						ctx.workspace.id,
						"mcp.sync_datasource",
						request.idempotencyKey,
						run,
					);
		}
		case "git_status":
		case "git_commit":
		case "git_push": {
			requireFunctionality(ctx, "gitEnabled", name !== "git_status");
			if (!deps.config.GIT_ENABLED || !deps.gitDatasources)
				throw new ServiceError(
					ErrorCodes.Forbidden,
					"Git is disabled for this deployment",
				);
			const connectionRef = args.connectionRef as string;
			const entry = await deps.gitDatasources.entryFor(
				ctx.workspace.id,
				connectionRef,
			);
			if (entry === null)
				throw new ServiceError(
					ErrorCodes.NotFound,
					"No repository datasource in this project matches that ref",
				);
			const options = { timeoutMs: deps.config.GIT_TIMEOUT_MS };
			const audit = {
				workspaceId: ctx.workspace.id,
				userId: ctx.userId,
				connectionRef,
			};
			if (name === "git_status") return gitRepo.status(entry.repoPath, options);
			return withIdempotency(
				deps.appDb,
				ctx.workspace.id,
				`mcp.${name}`,
				args.idempotencyKey as string,
				() =>
					name === "git_commit"
						? gitRepo.commit(
								entry.repoPath,
								args.message as string,
								args.paths as string[],
								options,
								audit,
							)
						: gitRepo.push(
								entry.repoPath,
								args.setUpstream as boolean,
								options,
								audit,
							),
			);
		}
		case "describe_project":
			return describeProject(deps, ctx);

		case "describe_domain": {
			const datasource = await resolveDatasource(
				deps,
				ctx,
				args.datasource as string | undefined,
			);
			const domains = await domainMap(deps, ctx, datasource.id);
			const wanted = (args.name as string).toLowerCase();
			const domain = domains.find(
				(entry) => entry.name.toLowerCase() === wanted,
			);
			if (domain === undefined) {
				throw new ServiceError(
					ErrorCodes.NotFound,
					`No domain '${args.name as string}' on ${datasource.name}. Known: ${domains
						.map((entry) => entry.name)
						.join(", ")}`,
				);
			}
			return { datasource: datasource.id, domain };
		}

		case "list_docs": {
			const files = await listExposedFiles(deps, ctx);
			const ref =
				args.datasource === undefined
					? null
					: (await resolveDatasource(deps, ctx, args.datasource as string)).id;
			const needle = (args.query as string | undefined)?.toLowerCase();
			return {
				files: files.filter(
					(file) =>
						(ref === null ||
							file.datasourceRef === ref ||
							file.kind === "document") &&
						(needle === undefined || file.label.toLowerCase().includes(needle)),
				),
			};
		}

		case "read_doc":
			return readExposed(
				deps,
				ctx,
				args.uri as string,
				(args.offset as number | undefined) ?? 0,
			);

		case "search_docs":
			return searchExposed(
				deps,
				ctx,
				args.text as string,
				(args.max as number | undefined) ?? 50,
			);

		case "list_schemas": {
			const datasource = await resolveDatasource(
				deps,
				ctx,
				args.datasource as string | undefined,
			);
			requireUsable(datasource);
			const nodes = await deps.connections.schemaChildren(
				ctx.workspace,
				datasource.id,
				[],
				false,
			);
			return { datasource: datasource.id, nodes };
		}

		case "list_objects": {
			const datasource = await resolveDatasource(
				deps,
				ctx,
				args.datasource as string | undefined,
			);
			requireUsable(datasource);
			const category = (args.kind as string | undefined) ?? "tables";
			const nodes = await deps.connections.schemaChildren(
				ctx.workspace,
				datasource.id,
				[
					{ kind: "schema", name: args.schema as string },
					{
						kind: category as "tables",
						name: category,
					},
				],
				false,
			);
			return { datasource: datasource.id, schema: args.schema, nodes };
		}

		case "describe_object": {
			const datasource = await resolveDatasource(
				deps,
				ctx,
				args.datasource as string | undefined,
			);
			requireUsable(datasource);
			if (capabilitiesOf(datasource).introspection !== "sql") {
				throw new ServiceError(
					ErrorCodes.BadRequest,
					`${datasource.name} (${datasource.adapter}) cannot describe objects`,
				);
			}
			return deps.connections.describeObject(ctx.workspace, {
				connectionId: datasource.id,
				schema: args.schema as string,
				name: args.name as string,
				kind: ((args.kind as string | undefined) ?? "table") as "table",
			});
		}

		case "run_query":
			return runQuery(
				deps,
				ctx,
				args as { datasource?: string; sql: string; maxRows?: number },
			);

		default: {
			const exhaustive: never = name;
			throw new Error(`Unhandled tool ${String(exhaustive)}`);
		}
	}
}

/** The orientation call. Everything an agent needs before it guesses. */
async function describeProject(deps: McpDeps, ctx: McpContext) {
	const list = await datasources(deps, ctx);
	const files = await listExposedFiles(deps, ctx);
	const described = [];
	for (const datasource of list) {
		described.push({
			ref: datasource.id,
			name: datasource.name,
			engine: datasource.adapter,
			database: datasource.databaseName,
			readOnly: datasource.readOnly,
			description: datasource.branding?.description ?? null,
			unavailable: datasource.unavailable,
			capabilities: capabilitiesOf(datasource),
			paths: datasource.paths.map((pair) => pair.name),
			domains: await domainMap(deps, ctx, datasource.id),
		});
	}
	return {
		project: ctx.workspace.name,
		mode: ctx.mode,
		functionality: {
			domains: ctx.domainsEnabled === true,
			sync: ctx.syncEnabled === true,
			git: ctx.gitEnabled === true,
		},
		modeMeans:
			ctx.mode === "read-only"
				? "Writes are refused before they reach the database, and every query runs in a read-only transaction that is rolled back."
				: "A query you run commits. Datasources marked read only stay read-only anyway.",
		defaultDatasource: ctx.workspace.defaultConnectionRef,
		datasources: described,
		files,
	};
}

async function runQuery(
	deps: McpDeps,
	ctx: McpContext,
	args: { datasource?: string; sql: string; maxRows?: number },
) {
	if (!deps.rateLimiter.take("mcp.query", ctx.token.id)) {
		throw new ServiceError(
			ErrorCodes.RateLimited,
			"Too many queries from this token — slow down",
		);
	}
	const datasource = await resolveDatasource(deps, ctx, args.datasource);
	requireUsable(datasource);
	const capabilities = capabilitiesOf(datasource);
	if (!capabilities.sql) {
		throw new ServiceError(
			ErrorCodes.BadRequest,
			`${datasource.name} (${datasource.adapter}) does not run SQL`,
		);
	}
	const sandbox = ctx.mode === "read-only";
	if (sandbox) {
		// Layer 1 (docs/spec/mcp.md "Read-only"). Refused here, before a
		// connection is reserved, so the message can name the toggle.
		const dialect = asSqlDialect(capabilities.dialect ?? "postgres");
		const refusal = refuseWrites(args.sql, dialect ?? "postgres");
		if (refusal !== null) {
			throw new ServiceError(ErrorCodes.Forbidden, refusalMessage(refusal));
		}
	} else {
		requireCommitRole(ctx);
	}
	const maxRows = Math.min(
		deps.config.MCP_MAX_ROWS,
		args.maxRows ?? deps.config.MCP_MAX_ROWS,
	);
	const outcome = await deps.executions.runOnce(
		ctx.userId,
		ctx.workspace,
		{
			connectionId: datasource.id,
			sql: args.sql,
			idempotencyKey: crypto.randomUUID(),
		},
		{
			sandbox,
			maxRows,
			maxBytes: deps.config.MCP_MAX_BYTES,
			source: "mcp",
			mcpTokenId: ctx.token.id,
		},
	);
	if (outcome.status === "failed") {
		const error = outcome.error;
		throw new ServiceError(
			error?.code ?? ErrorCodes.BadRequest,
			error === undefined
				? "The query failed"
				: `${error.message}${error.position === undefined ? "" : ` (at character ${error.position})`}`,
		);
	}
	if (outcome.status === "cancelled") {
		throw new ServiceError(
			ErrorCodes.BadRequest,
			"The query was cancelled before it finished",
		);
	}
	return {
		datasource: datasource.id,
		committed: !sandbox,
		columns: outcome.columns.map((column) => column.name),
		rows: outcome.rows,
		rowCount: outcome.rowCount,
		resultSets: outcome.resultSets,
		statements: outcome.statements,
		truncated: outcome.truncated,
		elapsedMs: Math.round(outcome.elapsedMs),
		...(outcome.truncated
			? {
					note: `Only the first ${maxRows} rows are returned; aggregate or add LIMIT/OFFSET rather than asking for more.`,
				}
			: {}),
	};
}

function requireFunctionality(
	ctx: McpContext,
	key: "syncEnabled" | "gitEnabled" | "domainsEnabled",
	writes: boolean,
): void {
	if (ctx[key] !== true)
		throw new ServiceError(
			ErrorCodes.Forbidden,
			"This functionality is disabled in the MCP Server tab",
		);
	if (writes && (ctx.mode !== "read-write" || ctx.role !== "editor"))
		throw new ServiceError(
			ErrorCodes.Forbidden,
			"This operation requires MCP read/write mode and editor access",
		);
}
