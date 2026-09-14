#!/usr/bin/env node
/**
 * `bunx @datagripe/cli` — the whole application from one command: the
 * server, the built web app it serves, and an embedded PostgreSQL it
 * starts for itself. Nothing to configure and nothing to install first.
 *
 * Plain node runs this file, so it is written for node and not for Bun:
 * `npx` hands it to whatever `node` is on PATH, and the point of the
 * package is that somebody without Bun can still start DataGripe. The
 * server itself is Bun-only — `Bun.serve`, `bun:sqlite`, `Bun.SQL` — so
 * this finds a Bun to run it with and gets out of the way.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = require(path.join(root, "package.json"));
const server = path.join(root, "apps", "server", "src", "index.js");
const entries = {
	serve: server,
	personal: server,
	migrate: path.join(root, "apps", "server", "src", "migrate.js"),
};

const USAGE = `DataGripe ${pkg.version} — a web-based database IDE.

  datagripe personal           Just for you, on this machine: its own
                               database, no accounts, and it answers
                               nothing but localhost. Ignores any
                               database configuration in the environment.
  datagripe [options]          Start the server and serve the web app,
                               taking its configuration from the
                               environment.
  datagripe migrate            Apply pending migrations to APP_DATABASE_URL
                               and exit. Only for a shared deployment:
                               the embedded database migrates itself at
                               startup.

Options:
  -p, --port <port>     Port to listen on (default 3001, or $PORT)
      --data-dir <dir>  Where the embedded database, its secrets and any
                        cloned repositories live (default $DATAGRIPE_DATA_DIR,
                        else ~/.local/share/datagripe)
  -v, --version         Print the version and exit
  -h, --help            Print this help and exit

With no configuration DataGripe starts its own PostgreSQL cluster under
the data directory and runs direct-in, with no accounts — which is what
\`personal\` pins rather than merely defaults to. Point
APP_DATABASE_URL at a PostgreSQL you manage to switch to a shared
deployment with accounts and sign-in; that mode also needs
CONNECTION_ENCRYPTION_KEY and SESSION_SECRET, and migrations run at
startup as usual.

Every other knob is an environment variable:
https://github.com/datagripe/datagripe/blob/main/.env.example`;

/** Parse the handful of flags worth not making people spell as env vars. */
function parseArgs(argv) {
	const options = { command: "serve" };
	// One subcommand, and only in first position, so that a future
	// `datagripe migrate --to 0021` reads the way it should.
	if (argv[0] === "migrate" || argv[0] === "serve" || argv[0] === "personal") {
		options.command = argv[0];
		argv = argv.slice(1);
	}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		// `--port 3000` and `--port=3000` are both what people type.
		const eq = arg.indexOf("=");
		const [flag, inline] =
			arg.startsWith("--") && eq !== -1
				? [arg.slice(0, eq), arg.slice(eq + 1)]
				: [arg, undefined];
		const next = () => {
			const value = inline ?? argv[++i];
			if (value === undefined) {
				fail(`${flag} needs a value`);
			}
			return value;
		};
		switch (flag) {
			case "-h":
			case "--help":
				console.log(USAGE);
				process.exit(0);
				break;
			case "-v":
			case "--version":
				console.log(pkg.version);
				process.exit(0);
				break;
			case "-p":
			case "--port": {
				const port = Number(next());
				if (!Number.isInteger(port) || port < 1 || port > 65535) {
					fail(`--port must be a port number, got ${port}`);
				}
				options.port = String(port);
				break;
			}
			case "--data-dir":
				options.dataDir = path.resolve(next());
				break;
			default:
				fail(`unknown option ${arg}`);
		}
	}
	return options;
}

function fail(message) {
	console.error(`datagripe: ${message}\n\n${USAGE}`);
	process.exit(2);
}

/**
 * Where state that must outlive the process goes. Not the working
 * directory: `npx @datagripe/cli` is run from wherever somebody happens
 * to be standing, and a database that appears in one project's checkout
 * and is missing from the next directory is not a database anybody can
 * rely on.
 */
function defaultDataDir() {
	if (process.platform === "win32") {
		const local = process.env.LOCALAPPDATA;
		return local === undefined
			? path.join(os.homedir(), "AppData", "Local", "DataGripe")
			: path.join(local, "DataGripe");
	}
	if (process.platform === "darwin") {
		return path.join(
			os.homedir(),
			"Library",
			"Application Support",
			"DataGripe",
		);
	}
	const share = process.env.XDG_DATA_HOME;
	return share === undefined || share === ""
		? path.join(os.homedir(), ".local", "share", "datagripe")
		: path.join(share, "datagripe");
}

/**
 * Defaults for the paths only this package knows — where npm unpacked it
 * — and for the two settings whose checkout defaults are wrong once the
 * server serves the web app itself rather than sitting behind Vite.
 *
 * A variable already in the environment always wins: this fills gaps, it
 * does not take the configuration over.
 */
function serverEnv(options, port, dataDir) {
	const env = { ...process.env };
	const defaults = {
		PORT: port,
		// One origin, because the server is also the web server here. The
		// checkout's default names the Vite dev server, and leaving it
		// would fail every WebSocket upgrade on the origin check.
		WEB_ORIGIN: `http://localhost:${port}`,
		WEB_STATIC_DIR: path.join(root, "apps", "web", "dist"),
		MIGRATIONS_DIR: path.join(root, "apps", "server", "migrations"),
		EMBEDDED_PG_DATA_DIR: path.join(dataDir, "pg"),
		GIT_REPOS_DIR: path.join(dataDir, "repos"),
	};
	for (const [key, value] of Object.entries(defaults)) {
		if (env[key] === undefined || env[key] === "") {
			env[key] = value;
		}
	}

	if (options.command === "personal") {
		// Pinned rather than defaulted, and that is the whole point of
		// naming the shape: an APP_DATABASE_URL left in the environment —
		// which is most developers' environment — would otherwise turn
		// `personal` into a shared deployment that stops on two secrets it
		// has not got. Asking for the personal one should not depend on
		// what else is exported in the shell.
		env.DATABASE_MODE = "embedded";
		env.AUTH_DISABLED = "true";
		delete env.APP_DATABASE_URL;
		// Defaulted rather than pinned, because the reasoning inverts: no
		// shell exports HOST by accident, so one that does means it. A
		// server with no accounts should not answer the network it is
		// plugged into, and by default this one does not.
		if (env.HOST === undefined || env.HOST === "") {
			env.HOST = "127.0.0.1";
		}
	}

	return env;
}

/**
 * A Bun to run the server with, in the order that respects what is
 * already on the machine: an explicit choice, then the one the person
 * installed, then the copy npm pulled in as an optional dependency.
 *
 * That optional dependency is why `npx @datagripe/cli` works at all on a
 * machine with no Bun — and why it is optional rather than required: a
 * `--omit=optional` install, which is what the container image does, has
 * a Bun already and should not download a second one.
 */
function findBun() {
	const explicit = process.env.DATAGRIPE_BUN;
	if (explicit !== undefined && explicit !== "") {
		return explicit;
	}
	return onPath("bun") ?? bundledBun();
}

/** The first `bun` on PATH, absolute, or null. */
function onPath(command) {
	const names =
		process.platform === "win32"
			? [`${command}.exe`, `${command}.cmd`]
			: [command];
	for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
		for (const name of names) {
			const candidate = dir === "" ? null : path.join(dir, name);
			if (candidate !== null && existsSync(candidate)) {
				return candidate;
			}
		}
	}
	return null;
}

/**
 * The optional `bun` dependency's binary. That package ships a stub at
 * `bin/bun.exe` on every platform and its postinstall replaces it with
 * the real one, so the path is the same everywhere, `.exe` and all.
 *
 * The size test is for when that postinstall did not run — npm 12 blocks
 * lifecycle scripts unless they are approved. The stub is a few hundred
 * bytes of shell that explains itself, and Bun is tens of megabytes; run
 * the stub and the message is about npm rather than about DataGripe, so
 * this treats it as no Bun at all and says our own piece instead.
 */
function bundledBun() {
	try {
		const binary = require.resolve("bun/bin/bun.exe");
		return statSync(binary).size > 1_000_000 ? binary : null;
	} catch {
		return null;
	}
}

/**
 * `@embedded-postgres/<platform>` ships one real file per shared-library
 * SONAME plus a manifest of the symlinks the loader actually asks for,
 * and leaves creating them to a postinstall script. npm 12 blocks
 * lifecycle scripts by default and `bun install` runs them only for a
 * package the installing project trusts, so after a plain `npx install`
 * those links are missing and `initdb` exits on a library it cannot
 * find — which reads as DataGripe being broken.
 *
 * So create them here, from the same manifest their script reads.
 * Skipping the ones that are already there is what makes it a no-op on
 * every start after the first, and correct when the postinstall did run.
 */
function hydratePostgresBinaries() {
	const platform = process.platform === "win32" ? "windows" : process.platform;
	let root;
	try {
		// Derived from the package entry point rather than resolved
		// directly: the package's `exports` does not expose the manifest.
		const entry = require.resolve(
			`@embedded-postgres/${platform}-${process.arch}`,
		);
		root = path.join(path.dirname(entry), "..");
	} catch {
		// No binaries for this platform. Embedded mode will say so, in
		// its own words, when it tries to start.
		return;
	}
	let links;
	try {
		links = JSON.parse(
			readFileSync(path.join(root, "native", "pg-symlinks.json"), "utf8"),
		);
	} catch {
		return;
	}
	for (const { source, target } of links) {
		// `target` is the link to create, `source` is what it points at.
		const link = path.join(root, target);
		if (existsSync(link)) {
			continue;
		}
		try {
			symlinkSync(
				path.relative(path.dirname(link), path.join(root, source)),
				link,
			);
		} catch {
			// A race with another start, or a filesystem without symlinks.
			// Either way the cluster reports what it cannot load.
		}
	}
}

const options = parseArgs(process.argv.slice(2));
const entry = entries[options.command];
const port = options.port ?? process.env.PORT ?? "3001";
const dataDir =
	options.dataDir ?? process.env.DATAGRIPE_DATA_DIR ?? defaultDataDir();
const env = serverEnv(options, port, dataDir);

// The server logs JSON, which is right for a deployment and no way to
// greet somebody who typed `personal`. Printed before it starts because
// the first run initialises a PostgreSQL cluster and that is the part
// where a silent terminal looks like a hang.
if (options.command === "personal") {
	process.stdout.write(
		`\nDataGripe ${pkg.version} — personal\n\n` +
			`  ${env.WEB_ORIGIN}\n` +
			`  ${dataDir}\n\n` +
			"  No accounts, and nothing but this machine can reach it.\n" +
			"  The first run sets up a database; give it half a minute.\n\n",
	);
}

// Only when an embedded cluster is what is about to start — the same
// rule `config.ts` uses to choose the mode. A deployment with its own
// PostgreSQL has no business touching files in node_modules.
if (
	options.command === "serve" &&
	env.DATABASE_MODE !== "external" &&
	(env.APP_DATABASE_URL === undefined || env.APP_DATABASE_URL === "")
) {
	hydratePostgresBinaries();
}

// Already under Bun — `bunx` runs this file with Bun itself — so there is
// nothing to find and nothing to spawn. Assigning back into process.env
// is what lets the imported server read the defaults computed above.
if (typeof globalThis.Bun !== "undefined") {
	Object.assign(process.env, env);
	await import(entry);
} else {
	const bun = findBun();
	if (bun === null) {
		console.error(
			`datagripe: DataGripe runs on Bun, and no Bun was found.

Install it:            curl -fsSL https://bun.sh/install | bash
Or run it with Bun:    bunx @datagripe/cli
Or name one:           DATAGRIPE_BUN=/path/to/bun npx @datagripe/cli`,
		);
		process.exit(1);
	}
	const child = spawn(bun, ["run", entry], { env, stdio: "inherit" });
	// The server stops the embedded cluster on SIGTERM/SIGINT, so pass the
	// signal on and let it exit rather than exiting out from under it.
	for (const signal of ["SIGINT", "SIGTERM"]) {
		process.on(signal, () => child.kill(signal));
	}
	child.on("exit", (code, signal) => {
		process.exit(signal !== null ? 1 : (code ?? 0));
	});
}
