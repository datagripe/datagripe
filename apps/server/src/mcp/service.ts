import type {
	McpSettingsSetRequest,
	McpState,
	McpStatus,
	McpTokenCreateResult,
} from "@datagripe/contracts";
import { ErrorCodes } from "@datagripe/contracts/errors";
import { ServiceError } from "../connections/service";
import type { McpContext, McpDeps } from "./context";
import { buildBriefing } from "./instructions";
import { datasources, listExposedFiles } from "./knowledge";
import {
	createToken,
	listTokens,
	readSettings,
	revokeToken,
	writeSettings,
} from "./store";

/**
 * The panel's half of MCP (docs/spec/mcp.md "The panel"): what an owner
 * sees and changes over the WebSocket. The endpoint itself never comes
 * through here.
 */

export interface McpService {
	status: (workspace: { id: string }) => Promise<McpStatus>;
	state: (workspace: { id: string; name: string }) => Promise<McpState>;
	setSettings: (
		workspace: { id: string; name: string },
		userId: string,
		request: McpSettingsSetRequest,
	) => Promise<McpState>;
	createToken: (
		workspace: { id: string; name: string },
		userId: string,
		name: string,
	) => Promise<McpTokenCreateResult>;
	revokeToken: (
		workspace: { id: string; name: string },
		id: string,
	) => Promise<McpState>;
}

export function createMcpService(deps: McpDeps): McpService {
	/**
	 * The endpoint for one project. The project id is in the path
	 * because the scope is the project: two projects mean two entries in
	 * a client's config, and no tool ever has to ask which one was meant.
	 */
	function urlFor(workspaceId: string): string {
		// `WEB_ORIGIN` rather than the listening port: that is the address
		// this deployment already tells browsers to use, and the one a
		// proxy in front of it terminates. The port is right only when
		// nothing is in front, which is the case `WEB_ORIGIN` also
		// describes. `MCP_PUBLIC_URL` stays for the deployment that
		// answers MCP on a different hostname from the app.
		const base = deps.config.MCP_PUBLIC_URL ?? deps.config.WEB_ORIGIN;
		return `${base.replace(/\/+$/, "")}/mcp/${workspaceId}`;
	}

	/**
	 * The panel reads the project the way the endpoint does — same
	 * datasource list, same file index, same briefing resolution — so the
	 * counts it shows are the ones an agent will actually get.
	 */
	async function panelContext(workspace: {
		id: string;
		name: string;
	}): Promise<McpContext> {
		const settings = await readSettings(deps.appDb, workspace.id);
		const rows = await deps.appDb<Array<{ ref: string | null }>>`
			SELECT default_connection_ref AS ref FROM workspaces WHERE id = ${workspace.id}
		`;
		return {
			workspace: {
				id: workspace.id,
				name: workspace.name,
				defaultConnectionRef: rows[0]?.ref ?? null,
			},
			userId: "",
			token: { id: "", name: "panel" },
			role: "editor",
			mode: settings.mode,
		};
	}

	/**
	 * The settings row, and nothing more. The section header shows
	 * whether the server is on whether or not the panel is open, so this
	 * has to be cheap enough to ask for on every project open — one
	 * indexed read, no datasource list, no file walk, no briefing.
	 */
	async function status(workspace: { id: string }): Promise<McpStatus> {
		const settings = await readSettings(deps.appDb, workspace.id);
		const counted = await deps.appDb<{ count: string }[]>`
			SELECT count(*) AS count FROM mcp_tokens
			WHERE workspace_id = ${workspace.id} AND revoked_at IS NULL
		`;
		return {
			available: deps.config.MCP_ENABLED,
			enabled: settings.enabled,
			mode: settings.mode,
			tokenCount: Number(counted[0]?.count ?? 0),
		};
	}

	async function state(workspace: {
		id: string;
		name: string;
	}): Promise<McpState> {
		const settings = await readSettings(deps.appDb, workspace.id);
		const ctx = await panelContext(workspace);
		const list = await datasources(deps, ctx);
		// The file index and the briefing are both disk reads, and an
		// owner opening the panel is asking exactly what an agent would
		// see, so they are worth doing here rather than guessing.
		const files = await listExposedFiles(deps, ctx).catch(() => []);
		const briefing = await buildBriefing(deps, ctx).catch(() => null);
		return {
			available: deps.config.MCP_ENABLED,
			enabled: settings.enabled,
			mode: settings.mode,
			url: urlFor(workspace.id),
			updatedAt: settings.updatedAt,
			tokens: await listTokens(deps.appDb, workspace.id),
			datasources: list.map((entry) => ({
				ref: entry.id,
				name: entry.name,
				readOnly: entry.readOnly,
			})),
			fileCount: files.length,
			instructionsSource: briefing?.source ?? null,
		};
	}

	function requireAvailable(): void {
		if (!deps.config.MCP_ENABLED) {
			throw new ServiceError(
				ErrorCodes.Forbidden,
				"MCP is disabled for this deployment — MCP_ENABLED is off",
			);
		}
	}

	return {
		status,
		state,

		async setSettings(workspace, userId, request) {
			requireAvailable();
			await writeSettings(deps.appDb, workspace.id, userId, request);
			return state(workspace);
		},

		async createToken(workspace, userId, name) {
			requireAvailable();
			const created = await createToken(
				deps.appDb,
				workspace.id,
				userId,
				name.trim(),
			);
			return {
				token: created.token,
				value: created.value,
				state: await state(workspace),
			};
		},

		async revokeToken(workspace, id) {
			const revoked = await revokeToken(deps.appDb, workspace.id, id);
			if (!revoked) {
				throw new ServiceError(
					ErrorCodes.NotFound,
					"That token has already been revoked",
				);
			}
			return state(workspace);
		},
	};
}
