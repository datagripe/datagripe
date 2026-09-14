/**
 * `bun run db:migrate` — apply pending migrations to the external
 * database and exit. Embedded mode migrates itself at startup and has no
 * use for this.
 *
 * Its own module rather than an `import.meta.main` block inside
 * `migrate.ts`, because `migrate.ts` is also imported by the server and a
 * bundled server is a single file: every module in it sees
 * `import.meta.main` as true, so the guard stops guarding and the server
 * runs the migration CLI on the way up — which in embedded mode is the
 * error below, thrown before anything has started.
 */
import { loadConfig } from "../../config";
import { log } from "../../log";
import { migrate, migrationsDir } from "./migrate";
import { createAppDb } from "./pool";

const config = await loadConfig();
if (config.APP_DATABASE_URL === undefined) {
	throw new Error(
		"db:migrate targets an external database (APP_DATABASE_URL). Embedded mode migrates automatically at server startup.",
	);
}
const db = createAppDb(config.APP_DATABASE_URL);
try {
	const applied = await migrate(db, migrationsDir(config));
	if (applied.length === 0) {
		log.info("database already up to date");
	}
} finally {
	await db.close();
}
