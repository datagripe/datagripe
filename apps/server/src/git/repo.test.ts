import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	commit,
	fetch as gitFetch,
	incomingPaths,
	integrate,
	pull,
	push,
	stage,
	status,
} from "./repo";
import { parseStatus, unquotePath } from "./run";

/**
 * The repository section's operations (docs/spec/git-datasources.md
 * "The repository section").
 *
 * Against a real repository, because every constraint worth having here
 * is about what git actually does. The one this file exists for:
 * **a commit stages exactly what was ticked.** The domain export gets
 * that guarantee from a root-scoped pathspec; the sidebar gets it from
 * the checkbox list, and if that ever slips it slips silently and takes
 * somebody's work-in-progress into a commit with it.
 */

const OPTIONS = { timeoutMs: 20_000 };
const AUDIT = { workspaceId: "w-1", userId: "u-1", connectionRef: "git:x" };

async function gitAvailable(): Promise<boolean> {
	try {
		const child = Bun.spawn(["git", "--version"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		return (await child.exited) === 0;
	} catch {
		return false;
	}
}

const gitTest = (await gitAvailable()) ? test : test.skip;

async function git(cwd: string, args: string[]): Promise<string> {
	const child = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Test",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test",
			GIT_COMMITTER_EMAIL: "test@example.com",
		},
	});
	const out = await new Response(child.stdout).text();
	await child.exited;
	return out;
}

/** A repository with five modified files, which is the interesting case. */
async function repoWithChanges(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "dg-repo-"));
	await git(root, ["init", "--initial-branch=main"]);
	await git(root, ["config", "user.email", "test@example.com"]);
	await git(root, ["config", "user.name", "Test"]);
	for (const name of ["a.sql", "b.sql", "c.sql", "d.sql", "e.sql"]) {
		await writeFile(path.join(root, name), "select 1;\n");
	}
	await git(root, ["add", "."]);
	await git(root, ["commit", "-m", "initial"]);
	for (const name of ["a.sql", "b.sql", "c.sql", "d.sql", "e.sql"]) {
		await writeFile(path.join(root, name), `select 2; -- ${name}\n`);
	}
	return root;
}

describe("status", () => {
	gitTest("reports the whole work tree, not a sub-path", async () => {
		const root = await repoWithChanges();
		const result = await status(root, OPTIONS);
		expect(result.branch).toBe("main");
		expect(result.entries).toHaveLength(5);
		// Hiding a changed file because it sits outside a configured path
		// is how you commit half of something.
		expect(result.entries.map((entry) => entry.path).sort()).toEqual([
			"a.sql",
			"b.sql",
			"c.sql",
			"d.sql",
			"e.sql",
		]);
		expect(result.truncated).toBe(false);
	});

	gitTest("has no upstream in a fresh repository", async () => {
		const result = await status(await repoWithChanges(), OPTIONS);
		expect(result.upstream).toBeNull();
		expect(result.ahead).toBe(0);
		expect(result.behind).toBe(0);
	});
});

describe("commit", () => {
	gitTest("stages exactly the ticked paths and nothing else", async () => {
		const root = await repoWithChanges();
		const result = await commit(
			root,
			"two of five",
			["a.sql", "c.sql"],
			OPTIONS,
			AUDIT,
		);
		expect(result.exitCode).toBe(0);

		const committed = (
			await git(root, ["show", "--name-only", "--format=", "HEAD"])
		)
			.split("\n")
			.filter((line) => line !== "");
		expect(committed.sort()).toEqual(["a.sql", "c.sql"]);

		// And the other three are still modified, unstaged, uncommitted.
		expect(result.status.entries.map((entry) => entry.path).sort()).toEqual([
			"b.sql",
			"d.sql",
			"e.sql",
		]);
	});

	gitTest("a message of --amend is a message, not a flag", async () => {
		const root = await repoWithChanges();
		const first = (await git(root, ["rev-parse", "HEAD"])).trim();
		const result = await commit(root, "--amend", ["a.sql"], OPTIONS, AUDIT);
		expect(result.exitCode).toBe(0);
		// A new commit on top, not a rewritten one.
		expect(result.commitSha).not.toBe(first);
		expect((await git(root, ["log", "--format=%s", "-n", "1"])).trim()).toBe(
			"--amend",
		);
	});

	gitTest("a filename beginning with a dash is a filename", async () => {
		const root = await repoWithChanges();
		await writeFile(path.join(root, "-weird.sql"), "select 3;\n");
		const result = await commit(root, "dashed", ["-weird.sql"], OPTIONS, AUDIT);
		expect(result.exitCode).toBe(0);
		expect(
			await git(root, ["show", "--name-only", "--format=", "HEAD"]),
		).toContain("-weird.sql");
	});

	gitTest("an empty message refuses before running anything", async () => {
		const root = await repoWithChanges();
		await expect(commit(root, "   ", [], OPTIONS, AUDIT)).rejects.toThrow(
			/needs a message/,
		);
		// Nothing was staged on the way to the refusal.
		expect(await git(root, ["diff", "--cached", "--name-only"])).toBe("");
	});
});

describe("stage", () => {
	gitTest("ticking stages and unticking unstages", async () => {
		const root = await repoWithChanges();
		const staged = await stage(root, ["b.sql"], true, OPTIONS, AUDIT);
		expect(staged.entries.find((entry) => entry.path === "b.sql")?.staged).toBe(
			true,
		);

		const unstaged = await stage(root, ["b.sql"], false, OPTIONS, AUDIT);
		expect(
			unstaged.entries.find((entry) => entry.path === "b.sql")?.staged,
		).toBe(false);
	});
});

describe("push and pull", () => {
	gitTest("a push with no remote surfaces git's own stderr", async () => {
		// No credential management, as designed: the exit code is git's and
		// the message is git's, verbatim.
		const root = await repoWithChanges();
		const result = await push(root, false, OPTIONS, AUDIT);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.toLowerCase()).toContain("push destination");
	});

	gitTest("a pull with no upstream fails rather than hanging", async () => {
		const root = await repoWithChanges();
		const result = await pull(root, OPTIONS, AUDIT);
		expect(result.exitCode).not.toBe(0);
		expect(result.headMoved).toBe(false);
	});

	gitTest(
		"incomingPaths is empty with no upstream, and fetches nothing",
		async () => {
			expect(await incomingPaths(await repoWithChanges(), OPTIONS)).toEqual([]);
		},
	);
});

/** A bare origin, and a clone of it, so "behind" can be made true. */
async function clonedPair(): Promise<{ origin: string; clone: string }> {
	const base = await mkdtemp(path.join(tmpdir(), "dg-remote-"));
	const origin = path.join(base, "origin.git");
	const seed = path.join(base, "seed");
	await git(base, ["init", "--bare", "--initial-branch=main", origin]);
	await git(base, ["clone", origin, seed]);
	await git(seed, ["config", "user.email", "test@example.com"]);
	await git(seed, ["config", "user.name", "Test"]);
	await writeFile(path.join(seed, "a.sql"), "select 1;\n");
	await git(seed, ["add", "."]);
	await git(seed, ["commit", "-m", "initial"]);
	await git(seed, ["push", "-u", "origin", "main"]);
	const clone = path.join(base, "clone");
	await git(base, ["clone", origin, clone]);
	// `integrate` runs git with DataGripe's environment, not this file's,
	// so a rebase needs the identity in the clone's own config — as the
	// server's clone has it, since it commits.
	await git(clone, ["config", "user.email", "test@example.com"]);
	await git(clone, ["config", "user.name", "Test"]);
	return { origin, clone };
}

/** Somebody else's checkout pushing one commit: the shared-repo case. */
async function pushFromElsewhere(
	origin: string,
	file: string,
	content: string,
): Promise<void> {
	const other = await mkdtemp(path.join(tmpdir(), "dg-other-"));
	await git(other, ["clone", origin, "."]);
	await mkdir(path.dirname(path.join(other, file)), { recursive: true });
	await writeFile(path.join(other, file), content);
	await git(other, ["add", "."]);
	await git(other, ["commit", "-m", `elsewhere: ${file}`]);
	await git(other, ["push"]);
}

async function commitIn(
	root: string,
	file: string,
	content: string,
): Promise<void> {
	await writeFile(path.join(root, file), content);
	await git(root, ["add", "--", file]);
	await git(root, ["commit", "-m", `here: ${file}`]);
}

describe("fetch", () => {
	// The whole point of the refresh button: `rev-list` counts against
	// the remote-tracking ref, which is a memory of the last fetch. A
	// "0 behind" that nobody fetched for is a button telling you there is
	// nothing to pull when there is.
	gitTest("makes behind true rather than remembered", async () => {
		const { origin, clone } = await clonedPair();
		const other = path.join(path.dirname(origin), "other");
		await git(path.dirname(origin), ["clone", origin, other]);
		await git(other, ["config", "user.email", "test@example.com"]);
		await git(other, ["config", "user.name", "Test"]);
		await writeFile(path.join(other, "b.sql"), "select 2;\n");
		await git(other, ["add", "."]);
		await git(other, ["commit", "-m", "second"]);
		await git(other, ["push"]);

		// Before the fetch the clone is behind and does not know it.
		expect((await status(clone, OPTIONS)).behind).toBe(0);

		const result = await gitFetch(clone, OPTIONS, AUDIT);

		expect(result.exitCode).toBe(0);
		expect(result.status.behind).toBe(1);
		expect(result.headMoved).toBe(false);
		// A fetch moves no file: the work tree is exactly as it was.
		expect(result.status.entries).toHaveLength(0);
	});

	// Git treats a fetch with nothing to fetch from as a no-op rather
	// than an error, so the refresh button is safe to press in a
	// repository that has never had a remote: it comes back with a
	// status and no complaint.
	gitTest(
		"with no remote, it is a no-op that still reads the status",
		async () => {
			const result = await gitFetch(await repoWithChanges(), OPTIONS, AUDIT);
			expect(result.exitCode).toBe(0);
			expect(result.status.upstream).toBeNull();
			expect(result.status.entries).toHaveLength(5);
		},
	);
});

/**
 * The shape that wedged a real clone three times in one day: DataGripe
 * exports and commits `schema/`, people push `migrations/` from their
 * own checkouts, and the clone's next push is rejected as
 * non-fast-forward with no terminal to rebase in.
 */
describe("integrate", () => {
	gitTest("up to date is a no-op", async () => {
		const { clone } = await clonedPair();
		const result = await integrate(clone, OPTIONS, AUDIT);
		expect(result.exitCode).toBe(0);
		expect(result.headMoved).toBe(false);
	});

	gitTest("behind and not ahead fast-forwards", async () => {
		const { origin, clone } = await clonedPair();
		await pushFromElsewhere(origin, "migrations/001.sql", "create;\n");
		await gitFetch(clone, OPTIONS, AUDIT);

		const result = await integrate(clone, OPTIONS, AUDIT);

		expect(result.headMoved).toBe(true);
		expect(result.changedPaths).toEqual(["migrations/001.sql"]);
		expect(result.status.behind).toBe(0);
	});

	gitTest(
		"ahead and behind on other paths rebases, and the push then lands",
		async () => {
			const { origin, clone } = await clonedPair();
			await commitIn(clone, "schema.sql", "-- exported\n");
			await pushFromElsewhere(origin, "migrations/001.sql", "create;\n");
			await gitFetch(clone, OPTIONS, AUDIT);
			// The state from the bug report, before the fix: a push here is
			// rejected as non-fast-forward.
			expect((await push(clone, false, OPTIONS, AUDIT)).exitCode).not.toBe(0);

			const result = await integrate(clone, OPTIONS, AUDIT);

			expect(result.headMoved).toBe(true);
			// The files that changed underneath, not the commit replayed.
			expect(result.changedPaths).toEqual(["migrations/001.sql"]);
			expect(result.status).toMatchObject({ ahead: 1, behind: 0 });
			// Linear: the local commit now sits on the remote's.
			expect(await git(clone, ["rev-parse", "HEAD~1"])).toBe(
				await git(origin, ["rev-parse", "main"]),
			);
			expect((await push(clone, false, OPTIONS, AUDIT)).exitCode).toBe(0);
		},
	);

	gitTest(
		"a real conflict aborts and leaves branch and tree as they were",
		async () => {
			const { origin, clone } = await clonedPair();
			await commitIn(clone, "a.sql", "select 'here';\n");
			await pushFromElsewhere(origin, "a.sql", "select 'there';\n");
			await gitFetch(clone, OPTIONS, AUDIT);
			const before = await git(clone, ["rev-parse", "HEAD"]);

			const refusal = integrate(clone, OPTIONS, AUDIT);

			await expect(refusal).rejects.toThrow("rebase was aborted");
			await expect(refusal).rejects.toThrow("CONFLICT");
			expect(await git(clone, ["rev-parse", "HEAD"])).toBe(before);
			expect(await readFile(path.join(clone, "a.sql"), "utf8")).toBe(
				"select 'here';\n",
			);
			const after = await status(clone, OPTIONS);
			expect(after.entries).toHaveLength(0);
			expect(after).toMatchObject({ branch: "main", ahead: 1, behind: 1 });
			// No rebase left half-done for the next command to trip over.
			const rebaseDir = await git(clone, [
				"rev-parse",
				"--git-path",
				"rebase-merge",
			]);
			expect(
				await stat(path.resolve(clone, rebaseDir.trim())).catch(() => null),
			).toBeNull();
		},
	);

	gitTest(
		"a rebase with uncommitted tracked changes refuses, not stashes",
		async () => {
			const { origin, clone } = await clonedPair();
			await commitIn(clone, "schema.sql", "-- exported\n");
			await writeFile(path.join(clone, "a.sql"), "select 'unsaved';\n");
			await pushFromElsewhere(origin, "migrations/001.sql", "create;\n");
			await gitFetch(clone, OPTIONS, AUDIT);
			const before = await git(clone, ["rev-parse", "HEAD"]);

			await expect(integrate(clone, OPTIONS, AUDIT)).rejects.toThrow(
				"Commit or discard the changes to a.sql",
			);
			expect(await git(clone, ["rev-parse", "HEAD"])).toBe(before);
			expect(await readFile(path.join(clone, "a.sql"), "utf8")).toBe(
				"select 'unsaved';\n",
			);
			expect(await git(clone, ["stash", "list"])).toBe("");
		},
	);
});

describe("parseStatus", () => {
	test("keeps git's letters and tells staged from not", () => {
		const entries = parseStatus(
			[
				"M  staged.sql",
				" M unstaged.sql",
				"?? new.sql",
				"MM both.sql",
				"R  old.sql -> new-name.sql",
			].join("\n"),
		);
		expect(entries.map((entry) => entry.status)).toEqual([
			"M ",
			" M",
			"??",
			"MM",
			"R ",
		]);
		expect(entries.map((entry) => entry.staged)).toEqual([
			true,
			false,
			false,
			true,
			true,
		]);
		// A rename's path is the destination; where it came from is kept.
		expect(entries[4]?.path).toBe("new-name.sql");
		expect(entries[4]?.originalPath).toBe("old.sql");
	});
});

describe("unquotePath", () => {
	test("decodes git's C-style quoting", () => {
		// The tree needs the real bytes, not `"caf\303\251.sql"`.
		expect(unquotePath('"caf\\303\\251.sql"')).toBe("café.sql");
		expect(unquotePath('"with space.sql"')).toBe("with space.sql");
		expect(unquotePath('"say \\"hi\\".sql"')).toBe('say "hi".sql');
		expect(unquotePath("plain.sql")).toBe("plain.sql");
	});
});
