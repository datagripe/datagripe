/**
 * Stage a checkout-free DataGripe distribution into `dist/`. Both things
 * we publish are made of it: the npm package `@datagripe/cli`, and the
 * container image, which is this directory plus a Bun to run it.
 *
 *   dist/package.json              @datagripe/cli — the bin and the two
 *                                  dependencies that cannot be bundled
 *   dist/bin/datagripe.mjs         the launcher, runnable under plain node
 *   dist/apps/server/src/index.js  the bundled server
 *   dist/apps/server/migrations/   applied at app startup in both database modes
 *   dist/apps/web/dist/            the built web app, served by the server
 *
 * The checkout's directory layout is reproduced on purpose, down to the
 * `apps/server/src`. `config.ts` derives the repository root from its own
 * `import.meta.dir` and resolves every relative path — and the `.env`
 * merge — against it. Putting the bundle where the source was makes that
 * root the distribution root, so the defaults for the migrations
 * directory, `connections.json` and `.env` land inside the package rather
 * than three directories above wherever npm happened to unpack it.
 *
 * `embedded-postgres` stays external because its binaries are a platform
 * package resolved at runtime, and there is no bundling a 60MB PostgreSQL
 * into a JavaScript file. It is a real dependency of the published
 * package, so npm and `bun install` fetch the right one per platform.
 */
import { chmod, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..", "..");
const outDir = path.join(repoRoot, "dist");
const serverOut = path.join(outDir, "apps", "server");

interface PackageJson {
	version: string;
	packageManager?: string;
	dependencies?: Record<string, string>;
	trustedDependencies?: string[];
}

async function readJson<T>(file: string): Promise<T> {
	return (await Bun.file(file).json()) as T;
}

async function run(command: string[]): Promise<void> {
	const child = Bun.spawn(command, {
		cwd: repoRoot,
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await child.exited) !== 0) {
		throw new Error(`${command.join(" ")} failed`);
	}
}

const rootPkg = await readJson<PackageJson>(
	path.join(repoRoot, "package.json"),
);
const serverPkg = await readJson<PackageJson>(
	path.join(repoRoot, "apps", "server", "package.json"),
);

const embeddedPostgres = serverPkg.dependencies?.["embedded-postgres"];
if (embeddedPostgres === undefined) {
	throw new Error(
		"apps/server/package.json no longer depends on embedded-postgres; the distribution's dependency list is derived from it",
	);
}
// `bun@1.4.0` — the version the workspace is pinned to, and the one the
// published package offers to install for people who have no Bun.
const bunVersion = (rootPkg.packageManager ?? "").split("@")[1];
if (bunVersion === undefined || bunVersion === "") {
	throw new Error(
		"root package.json has no packageManager pin to read Bun's version from",
	);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(serverOut, { recursive: true });

console.log("[dist] building the web app");
await run(["bun", "run", "--cwd", "apps/web", "build"]);

console.log("[dist] bundling the server");
// Two bundles, side by side at the depth the source was: `index.js` is
// the server and `migrate.js` is what `datagripe migrate` runs against an
// external database. Both land in `apps/server/src`, so the repository
// root `config.ts` derives from its own location is the distribution root
// for each of them. Separate builds rather than one two-entrypoint build
// because the output names have to be these, not the entry files'.
for (const [name, entry] of [
	["index.js", ["src", "index.ts"]],
	["migrate.js", ["src", "db", "app", "migrate.cli.ts"]],
] as const) {
	const build = await Bun.build({
		entrypoints: [path.join(repoRoot, "apps", "server", ...entry)],
		outdir: path.join(serverOut, "src"),
		naming: name,
		target: "bun",
		external: ["embedded-postgres"],
	});
	if (!build.success) {
		for (const message of build.logs) {
			console.error(String(message));
		}
		throw new Error(`server bundle failed: ${name}`);
	}
}

console.log("[dist] staging migrations and web assets");
await cp(
	path.join(repoRoot, "apps", "server", "migrations"),
	path.join(serverOut, "migrations"),
	{ recursive: true },
);
await cp(
	path.join(repoRoot, "apps", "web", "dist"),
	path.join(outDir, "apps", "web", "dist"),
	{ recursive: true },
);

console.log("[dist] writing the package");
await mkdir(path.join(outDir, "bin"), { recursive: true });
const launcher = path.join(outDir, "bin", "datagripe.mjs");
await cp(path.join(import.meta.dir, "launcher.mjs"), launcher);
await chmod(launcher, 0o755);
await cp(path.join(repoRoot, "LICENSE"), path.join(outDir, "LICENSE"));
await cp(
	path.join(import.meta.dir, "README.md"),
	path.join(outDir, "README.md"),
);

await writeFile(
	path.join(outDir, "package.json"),
	`${JSON.stringify(
		{
			name: "@datagripe/cli",
			version: rootPkg.version,
			description:
				"DataGripe — a web-based database IDE. Runs the server and the web app from one command.",
			license: "MIT",
			type: "module",
			bin: { datagripe: "bin/datagripe.mjs" },
			engines: { node: ">=20" },
			repository: {
				type: "git",
				url: "git+https://github.com/datagripe/datagripe.git",
			},
			homepage: "https://datagripe.com",
			bugs: { url: "https://github.com/datagripe/datagripe/issues" },
			keywords: [
				"database",
				"sql",
				"postgres",
				"mysql",
				"sqlite",
				"redis",
				"ide",
			],
			dependencies: { "embedded-postgres": embeddedPostgres },
			// The platform package's postinstall resolves the symlinks its
			// shared libraries are reached through; without it `initdb`
			// starts and dies on a missing `libicuuc`. npm runs it by
			// default, `bun install` only for a package named here.
			trustedDependencies: rootPkg.trustedDependencies,
			// Optional so the container image can skip it with
			// `--omit=optional`: it already has a Bun, and this one is a
			// second 40MB download it would never run.
			optionalDependencies: { bun: bunVersion },
			publishConfig: { access: "public" },
		},
		null,
		2,
	)}\n`,
);

const migrations = (await readdir(path.join(serverOut, "migrations"))).filter(
	(name) => name.endsWith(".sql"),
);
console.log(
	`[dist] staged ${outDir} (@datagripe/cli ${rootPkg.version}, ${migrations.length} migrations)`,
);
