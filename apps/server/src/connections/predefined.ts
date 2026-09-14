import {
	type PredefinedConnection,
	predefinedConnectionsFileSchema,
} from "@datagripe/contracts";
import type { ResolvedConnection } from "@datagripe/database-adapters";
import { type AppConfig, resolveRepoPath } from "../config";

/**
 * Predefined connections (docs/spec/connection-sources.md): read-only
 * connections declared in a JSON config file. Secrets are resolved from
 * the process environment at boot and held only in memory — they never
 * touch the application database.
 */

export interface PredefinedEntry {
	definition: PredefinedConnection;
	resolved: ResolvedConnection;
	/** Boot time; predefined entries have no natural timestamps. */
	loadedAt: string;
}

/**
 * Through `resolveRepoPath` rather than counting `..` from this file: a
 * bundled server is one file, so a depth measured from this module's
 * location would be measured from the bundle's instead and land outside
 * the distribution. One definition of where the root is.
 */
export const DEFAULT_CONNECTIONS_FILE = resolveRepoPath("connections.json");

export async function loadPredefinedConnections(
	config: Pick<AppConfig, "CONNECTIONS_FILE">,
	env: Record<string, string | undefined> = Bun.env,
): Promise<Map<string, PredefinedEntry>> {
	const filePath = config.CONNECTIONS_FILE ?? DEFAULT_CONNECTIONS_FILE;
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		if (config.CONNECTIONS_FILE !== undefined) {
			throw new Error(`CONNECTIONS_FILE points at a missing file: ${filePath}`);
		}
		return new Map();
	}

	let raw: unknown;
	try {
		raw = await file.json();
	} catch {
		throw new Error(`CONNECTIONS_FILE is not valid JSON: ${filePath}`);
	}

	const parsed = predefinedConnectionsFileSchema.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
			.join("\n");
		throw new Error(
			`Invalid predefined connections file ${filePath}:\n${issues}`,
		);
	}

	const entries = new Map<string, PredefinedEntry>();
	const loadedAt = new Date().toISOString();
	for (const definition of parsed.data.connections) {
		let password: string;
		if (definition.passwordEnv !== undefined) {
			const fromEnv = env[definition.passwordEnv];
			if (fromEnv === undefined) {
				throw new Error(
					`Predefined connection '${definition.id}': environment variable ${definition.passwordEnv} is not set`,
				);
			}
			password = fromEnv;
		} else if (definition.password !== undefined) {
			password = definition.password;
		} else {
			// Unreachable: the schema requires one of the two.
			throw new Error(
				`Predefined connection '${definition.id}': no password source`,
			);
		}

		entries.set(definition.id, {
			definition,
			resolved: {
				adapter: definition.adapter,
				host: definition.host ?? "",
				port: definition.port ?? 0,
				database: definition.database,
				username: definition.username ?? "",
				password,
				tlsMode: definition.tlsMode,
				readOnly: definition.readOnly,
				params: definition.params,
			},
			loadedAt,
		});
	}
	return entries;
}
