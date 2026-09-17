import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SQL } from "bun";
import { migrate } from "./migrate";

const ADMIN_URL = "postgres://datagripe:datagripe@localhost:5432/postgres";
const database = `datagripe_migrations_${crypto.randomUUID().replaceAll("-", "")}`;
let reachable = false;
let db: SQL;
let peer: SQL;
let directory: string;
const admin = new SQL(ADMIN_URL, { connectionTimeout: 2 });
try {
	await admin`SELECT 1`;
	reachable = true;
} catch {
	await admin.close();
}
const pgTest = reachable ? test : test.skip;

beforeAll(async () => {
	if (!reachable) return;
	await admin.unsafe(`CREATE DATABASE ${database}`);
	const url = `postgres://datagripe:datagripe@localhost:5432/${database}`;
	db = new SQL(url);
	peer = new SQL(url);
	directory = await mkdtemp(path.join(tmpdir(), "dg-migrations-"));
});
beforeEach(async () => {
	if (!reachable) return;
	await db.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
	await rm(directory, { recursive: true, force: true });
	const { mkdir } = await import("node:fs/promises");
	await mkdir(directory);
});
afterAll(async () => {
	if (!reachable) return;
	await db.close();
	await peer.close();
	await admin.unsafe(`DROP DATABASE ${database}`);
	await admin.close();
	await rm(directory, { recursive: true, force: true });
});

describe("startup migration coordination", () => {
	pgTest(
		"applies only missing files in order and a restart is a no-op",
		async () => {
			await writeFile(
				path.join(directory, "0001_first.sql"),
				"CREATE TABLE migrated (value integer); INSERT INTO migrated VALUES (1)",
			);
			expect(await migrate(db, directory)).toEqual(["0001_first.sql"]);
			await writeFile(
				path.join(directory, "0002_second.sql"),
				"INSERT INTO migrated VALUES (2)",
			);
			expect(await migrate(db, directory)).toEqual(["0002_second.sql"]);
			expect(await migrate(db, directory)).toEqual([]);
			expect(
				await db<
					Array<{ value: number }>
				>`SELECT value FROM migrated ORDER BY value`,
			).toEqual([{ value: 1 }, { value: 2 }]);
		},
	);
	pgTest(
		"concurrent app instances bootstrap and apply each migration exactly once",
		async () => {
			// Neither statement is idempotent: the test must prove locking, not
			// rely on migrations tolerating duplicate execution.
			await writeFile(
				path.join(directory, "0001_first.sql"),
				"SELECT pg_sleep(0.1); CREATE TABLE migrated (value integer); INSERT INTO migrated VALUES (1)",
			);
			await writeFile(
				path.join(directory, "0002_second.sql"),
				"SELECT pg_sleep(0.1); INSERT INTO migrated VALUES (2)",
			);
			const applied = await Promise.all([
				migrate(db, directory),
				migrate(peer, directory),
			]);
			expect(applied.flat().sort()).toEqual([
				"0001_first.sql",
				"0002_second.sql",
			]);
			expect(
				await db<
					Array<{ value: number }>
				>`SELECT value FROM migrated ORDER BY value`,
			).toEqual([{ value: 1 }, { value: 2 }]);
			expect(
				await db<
					Array<{ name: string }>
				>`SELECT name FROM schema_migrations ORDER BY name`,
			).toEqual([{ name: "0001_first.sql" }, { name: "0002_second.sql" }]);
		},
	);
	pgTest(
		"failure rolls back its DDL and history and releases the lock for retry",
		async () => {
			await writeFile(
				path.join(directory, "0001_first.sql"),
				"CREATE TABLE migrated (value integer)",
			);
			await writeFile(
				path.join(directory, "0002_bad.sql"),
				"CREATE TABLE rolled_back (value integer); SELECT * FROM missing_table",
			);
			await expect(migrate(db, directory)).rejects.toThrow();
			expect(
				await db<Array<{ name: string }>>`SELECT name FROM schema_migrations`,
			).toEqual([{ name: "0001_first.sql" }]);
			expect(
				await db<
					Array<{ table_name: string | null }>
				>`SELECT to_regclass('public.rolled_back') AS table_name`,
			).toEqual([{ table_name: null }]);
			await writeFile(
				path.join(directory, "0002_bad.sql"),
				"CREATE TABLE rolled_back (value integer)",
			);
			expect(await migrate(peer, directory)).toEqual(["0002_bad.sql"]);
		},
	);
});

pgTest(
	"external app startup migrates before listening and refuses a broken migration",
	async () => {
		const { cp } = await import("node:fs/promises");
		await cp(path.resolve(import.meta.dir, "../../../migrations"), directory, {
			recursive: true,
		});
		const boot = () => {
			const listener = Bun.serve({
				hostname: "127.0.0.1",
				port: 0,
				fetch: () => new Response(),
			});
			const port = listener.port;
			listener.stop(true);
			const child = Bun.spawn(
				[
					process.execPath,
					"run",
					path.resolve(import.meta.dir, "../../index.ts"),
				],
				{
					env: {
						...process.env,
						DATABASE_MODE: "external",
						APP_DATABASE_URL: `postgres://datagripe:datagripe@localhost:5432/${database}`,
						AUTH_DISABLED: "true",
						CONNECTION_ENCRYPTION_KEY: "01".repeat(32),
						SESSION_SECRET: "startup-migration-test-secret-".repeat(3),
						MIGRATIONS_DIR: directory,
						HOST: "127.0.0.1",
						PORT: String(port),
						WEB_ORIGIN: `http://127.0.0.1:${port}`,
						UPDATE_CHECK_DISABLED: "true",
					},
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			const output = Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
			]);
			return { child, output, url: `http://127.0.0.1:${port}/health` };
		};
		const waitForStartup = async (app: ReturnType<typeof boot>) => {
			for (let attempt = 0; attempt < 200; attempt++) {
				if (app.child.exitCode !== null) return false;
				if (
					await fetch(app.url).then(
						(r) => r.ok,
						() => false,
					)
				)
					return true;
				await Bun.sleep(25);
			}
			throw new Error("App did not finish startup");
		};
		const app = boot();
		try {
			expect(await waitForStartup(app)).toBe(true);
			const applied = await db<
				Array<{ name: string }>
			>`SELECT name FROM schema_migrations ORDER BY name`;
			expect(applied.at(-1)?.name).toBe("0027_mcp-functionality.sql");
			expect(
				await db<
					Array<{ domains_enabled: boolean }>
				>`SELECT domains_enabled FROM mcp_settings LIMIT 1`,
			).toEqual([]);
		} finally {
			app.child.kill("SIGTERM");
			await app.child.exited;
			await app.output;
		}
		await writeFile(
			path.join(directory, "9999_failed.sql"),
			"CREATE TABLE startup_rollback (id integer); SELECT * FROM missing_startup_table",
		);
		const broken = boot();
		try {
			expect(await waitForStartup(broken)).toBe(false);
			expect(await broken.child.exited).not.toBe(0);
			expect((await broken.output).join("\n")).toContain("9999_failed.sql");
			expect(
				await db<
					Array<{ name: string }>
				>`SELECT name FROM schema_migrations WHERE name = '9999_failed.sql'`,
			).toEqual([]);
			expect(
				await db<
					Array<{ table_name: string | null }>
				>`SELECT to_regclass('public.startup_rollback') AS table_name`,
			).toEqual([{ table_name: null }]);
		} finally {
			if (broken.child.exitCode === null) broken.child.kill("SIGTERM");
			await broken.child.exited;
			await broken.output;
		}
	},
	20_000,
);
