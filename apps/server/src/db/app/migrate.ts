import { readdir } from "node:fs/promises";
import path from "node:path";
import { type AppConfig, resolveRepoPath } from "../../config";
import { log } from "../../log";
import type { AppDb } from "./pool";

/**
 * Where the migrations sit in a checkout; `MIGRATIONS_DIR` overrides it.
 * Resolved from the repository root rather than by counting `..` from
 * this file, so a bundled server — which is one file, at a different
 * depth — still finds them.
 */
const MIGRATIONS_DIR = resolveRepoPath("apps/server/migrations");

/** The configured migrations directory, resolved, or the checkout's. */
export function migrationsDir(
	config: Pick<AppConfig, "MIGRATIONS_DIR">,
): string {
	return config.MIGRATIONS_DIR === undefined
		? MIGRATIONS_DIR
		: resolveRepoPath(config.MIGRATIONS_DIR);
}

async function ensureMigrationsTable(db: AppDb): Promise<void> {
	await db`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function appliedMigrations(db: AppDb): Promise<Set<string>> {
	const rows = await db`SELECT name FROM schema_migrations`;
	return new Set(rows.map((row: { name: string }) => row.name));
}

export async function listMigrationFiles(
	dir: string = MIGRATIONS_DIR,
): Promise<string[]> {
	const entries = await readdir(dir);
	return entries.filter((name) => name.endsWith(".sql")).sort();
}

/**
 * Apply pending migrations in filename order. Each migration runs in a
 * transaction and is recorded in schema_migrations.
 */
export async function migrate(
	db: AppDb,
	dir: string = MIGRATIONS_DIR,
): Promise<string[]> {
	await ensureMigrationsTable(db);
	const applied = await appliedMigrations(db);
	const files = await listMigrationFiles(dir);
	const newlyApplied: string[] = [];

	for (const file of files) {
		if (applied.has(file)) {
			continue;
		}
		const sql = await Bun.file(path.join(dir, file)).text();
		await db.begin(async (tx) => {
			await tx.unsafe(sql);
			await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
		});
		newlyApplied.push(file);
		log.info("migration applied", { migration: file });
	}
	return newlyApplied;
}
