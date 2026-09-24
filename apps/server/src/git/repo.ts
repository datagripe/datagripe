import { rm } from "node:fs/promises";
import path from "node:path";
import type { GitCommandResult, GitStatusResult } from "@datagripe/contracts";
import { ErrorCodes } from "@datagripe/contracts/errors";
import { ServiceError } from "../connections/service";
import { log } from "../log";
import {
	currentBranch,
	type GitOptions,
	headSha,
	type RunResult,
	repoStatus,
	run,
	tracking,
	workTreeRoot,
} from "./run";

/**
 * The repository section's operations (docs/spec/git-datasources.md
 * "The repository section").
 *
 * Status, stage, commit, push, pull, clone — and `integrate`, the one
 * verb for callers with no terminal to go to. That is the whole list
 * and it is not going to grow into a git client: when git needs a
 * decision DataGripe cannot represent, it stops and shows you git's own
 * stderr, and you go to a terminal.
 *
 * Every function here is called because somebody pressed something.
 * Nothing polls, nothing runs on save, nothing runs on open.
 */

export interface RepoAudit {
	workspaceId: string;
	userId: string;
	connectionRef: string;
}

/** Every user-supplied path follows a `--`, so a file named `-f` is a file. */
function pathspec(paths: string[]): string[] {
	return ["--", ...paths];
}

export async function status(
	root: string,
	options: GitOptions,
): Promise<GitStatusResult> {
	return repoStatus(root, options);
}

/**
 * Tick a row: `add`. Untick it: `restore --staged`. Never `-A`, never a
 * pathspec the person did not name.
 */
export async function stage(
	root: string,
	paths: string[],
	staged: boolean,
	options: GitOptions,
	audit: RepoAudit,
): Promise<GitStatusResult> {
	log.audit("git.stage", { ...audit, root, staged, paths: paths.length });
	const result = staged
		? await run(root, ["add", ...pathspec(paths)], options)
		: await run(root, ["restore", "--staged", ...pathspec(paths)], options);
	if (result.exitCode !== 0) {
		throw new ServiceError(
			ErrorCodes.BadRequest,
			result.stderr.trim() === ""
				? `git ${staged ? "add" : "restore"} failed`
				: result.stderr.trim(),
		);
	}
	return repoStatus(root, options);
}

/**
 * Stage exactly the named paths, then commit.
 *
 * An empty `paths` commits what is already staged, which is what the
 * section does when every ticked row was already in the index. It is
 * still never `add -A`: a commit from DataGripe cannot pick up a file
 * nobody named.
 */
export async function commit(
	root: string,
	message: string,
	paths: string[],
	options: GitOptions,
	audit: RepoAudit,
): Promise<GitCommandResult> {
	if (message.trim() === "") {
		throw new ServiceError(ErrorCodes.BadRequest, "A commit needs a message");
	}
	log.audit("git.commit", {
		...audit,
		root,
		branch: await currentBranch(root, options),
		paths: paths.length,
	});

	const transcript: string[] = [];
	const errors: string[] = [];

	if (paths.length > 0) {
		const added = await run(root, ["add", ...pathspec(paths)], options);
		transcript.push(added.stdout);
		errors.push(added.stderr);
		if (added.exitCode !== 0) {
			return {
				exitCode: added.exitCode,
				stdout: transcript.join(""),
				stderr: errors.join(""),
				commitSha: null,
				status: await repoStatus(root, options),
				headMoved: false,
				changedPaths: [],
			};
		}
	}

	// `--` terminates the options so the message can never be read as one:
	// a message of `--amend` is a message.
	const committed = await run(root, ["commit", "-m", message, "--"], options);
	transcript.push(committed.stdout);
	errors.push(committed.stderr);

	return {
		exitCode: committed.exitCode,
		stdout: transcript.join(""),
		stderr: errors.join(""),
		commitSha: committed.exitCode === 0 ? await headSha(root, options) : null,
		status: await repoStatus(root, options),
		headMoved: false,
		changedPaths: [],
	};
}

/**
 * The only button here that leaves the machine, which is why it is
 * always a separate press and never bundled into anything else.
 */
export async function push(
	root: string,
	setUpstream: boolean,
	options: GitOptions,
	audit: RepoAudit,
): Promise<GitCommandResult> {
	const branch = await currentBranch(root, options);
	log.audit("git.push", { ...audit, root, branch, setUpstream });
	// `-u origin <branch>` is the one flag combination a user can ask
	// for, and it is still not their string: the branch is git's answer.
	const args =
		setUpstream && branch !== null
			? ["push", "--set-upstream", "origin", branch]
			: ["push"];
	const pushed = await run(root, args, options);
	return {
		exitCode: pushed.exitCode,
		stdout: pushed.stdout,
		// Git's verdict, not ours. A push that failed for want of
		// credentials reports exactly what git said about it.
		stderr: pushed.stderr,
		commitSha: null,
		status: await repoStatus(root, options),
		headMoved: false,
		changedPaths: [],
	};
}

/**
 * `fetch --quiet`: the only read here that leaves the machine.
 *
 * It moves no file and touches no work tree — it updates the
 * remote-tracking refs, which is what makes "2 ahead, 0 behind" a fact
 * rather than a memory of the last time somebody pulled. The refresh
 * button asks for it; nothing asks for it on a timer.
 *
 * Git's verdict comes back verbatim like every other command here, so a
 * fetch that failed for want of credentials says so instead of quietly
 * showing stale counts.
 */
export async function fetch(
	root: string,
	options: GitOptions,
	audit: RepoAudit,
): Promise<GitCommandResult> {
	log.audit("git.fetch", { ...audit, root });
	const fetched = await run(root, ["fetch", "--quiet"], options);
	return {
		exitCode: fetched.exitCode,
		stdout: fetched.stdout,
		stderr: fetched.stderr,
		commitSha: null,
		status: await repoStatus(root, options),
		headMoved: false,
		changedPaths: [],
	};
}

/**
 * `pull --ff-only`.
 *
 * Anything that would need a merge commit, a rebase or a conflict
 * resolution refuses with git's own message. DataGripe cannot represent
 * a conflicted work tree and must not pretend to.
 */
export async function pull(
	root: string,
	options: GitOptions,
	audit: RepoAudit,
): Promise<GitCommandResult> {
	const before = await headSha(root, options);
	log.audit("git.pull", {
		...audit,
		root,
		branch: await currentBranch(root, options),
	});
	const pulled = await run(root, ["pull", "--ff-only"], options);
	const after = await headSha(root, options);
	const headMoved = before !== null && after !== null && before !== after;

	// What moved, so open tabs can re-check exactly the files that did.
	let changedPaths: string[] = [];
	if (headMoved) {
		const diff = await run(
			root,
			["diff", "--name-only", `${before}..${after}`],
			options,
		);
		changedPaths = diff.stdout.split("\n").filter((line) => line !== "");
	}

	return {
		exitCode: pulled.exitCode,
		stdout: pulled.stdout,
		stderr: pulled.stderr,
		commitSha: headMoved ? after : null,
		status: await repoStatus(root, options),
		headMoved,
		changedPaths,
	};
}

/**
 * Bring the branch level with its upstream as the last fetch left it,
 * for a caller that cannot go to a terminal (docs/spec/mcp.md "Git").
 *
 * `pull --ff-only` is right for the sidebar, where somebody told "not
 * possible to fast-forward" has a terminal. An MCP agent does not, and
 * neither does anybody whose clone lives on a server: one unpushed
 * commit plus a remote that moved is a clone wedged until a person logs
 * in and rebases it by hand. So this goes one step further, and only
 * one:
 *
 * - **Behind, not ahead:** `merge --ff-only`, which carries uncommitted
 *   changes along when they do not overlap and refuses when they do.
 * - **Behind and ahead:** `rebase` the unpushed commits onto the
 *   upstream. They have never left this machine, so rewriting them
 *   rewrites nobody's history. Anything that stops the rebase aborts
 *   it, which puts the branch and the work tree back exactly where they
 *   were — DataGripe still never leaves a conflicted tree behind.
 *   Uncommitted changes to tracked files refuse up front rather than
 *   being stashed, because a stash that will not pop is a conflicted
 *   tree by another route.
 *
 * Never a merge commit and never a force. No fetch either: the caller
 * fetches, so it can check what is about to arrive before anything
 * moves. Refusals throw; they are not git's verdict on a command that
 * ran, they are DataGripe declining to run one.
 */
export async function integrate(
	root: string,
	options: GitOptions,
	audit: RepoAudit,
): Promise<GitCommandResult> {
	const { upstream, ahead, behind } = await tracking(root, options);
	if (upstream === null || behind === 0) {
		return {
			exitCode: 0,
			stdout: "",
			stderr: "",
			commitSha: null,
			status: await repoStatus(root, options),
			headMoved: false,
			changedPaths: [],
		};
	}
	const before = await headSha(root, options);
	log.audit("git.integrate", {
		...audit,
		root,
		branch: await currentBranch(root, options),
		upstream,
		ahead,
		behind,
	});

	let result: RunResult;
	if (ahead === 0) {
		// `--no-autostash` on both: a user's `merge.autoStash` or
		// `rebase.autoStash` is ambient configuration this must not inherit.
		result = await run(
			root,
			["merge", "--ff-only", "--no-autostash", upstream],
			options,
		);
		if (result.exitCode !== 0) {
			throw new ServiceError(
				ErrorCodes.Conflict,
				`Could not fast-forward to ${upstream}; nothing moved.\n${gitOutput(result)}`,
			);
		}
	} else {
		const dirty = (await repoStatus(root, options)).entries
			.filter((entry) => entry.status !== "??")
			.map((entry) => entry.path);
		if (dirty.length > 0) {
			throw new ServiceError(
				ErrorCodes.Conflict,
				`${upstream} has ${plural(behind, "commit")} this clone does not, and replaying the ${plural(ahead, "unpushed commit")} on top of ${behind === 1 ? "it" : "them"} needs a clean work tree. Commit or discard the changes to ${dirty.join(", ")} first.`,
			);
		}
		result = await run(root, ["rebase", "--no-autostash", upstream], options);
		if (result.exitCode !== 0) {
			// Whatever stopped it, stop it completely. With no rebase in
			// progress (it refused before starting) this is a no-op.
			await run(root, ["rebase", "--abort"], options);
			throw new ServiceError(
				ErrorCodes.Conflict,
				`Replaying the ${plural(ahead, "unpushed commit")} on top of ${upstream} stopped, so the rebase was aborted: the branch and work tree are as they were. This needs a person — in the clone, \`git pull --rebase\`, resolve, push.\n${gitOutput(result)}`,
			);
		}
	}

	const after = await headSha(root, options);
	const headMoved = before !== null && after !== null && before !== after;
	let changedPaths: string[] = [];
	if (headMoved) {
		const diff = await run(
			root,
			["diff", "--name-only", `${before}..${after}`],
			options,
		);
		changedPaths = diff.stdout.split("\n").filter((line) => line !== "");
	}
	return {
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
		commitSha: headMoved ? after : null,
		status: await repoStatus(root, options),
		headMoved,
		changedPaths,
	};
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Git's own words, both streams: a rebase says CONFLICT on stdout. */
function gitOutput(result: RunResult): string {
	return [result.stdout.trim(), result.stderr.trim()]
		.filter((part) => part !== "")
		.join("\n");
}

/**
 * Files a pull would touch, without pulling: everything between HEAD and
 * the upstream as it is currently known. Used to refuse a pull that
 * would fast-forward over somebody's unsaved work.
 *
 * No fetch. This reads the remote-tracking ref the last fetch left, so
 * asking the question does not reach the network.
 */
export async function incomingPaths(
	root: string,
	options: GitOptions,
): Promise<string[]> {
	const upstream = await run(
		root,
		["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
		options,
	);
	const name = upstream.stdout.trim();
	if (upstream.exitCode !== 0 || name === "") {
		return [];
	}
	const diff = await run(
		root,
		["diff", "--name-only", `HEAD...${name}`],
		options,
	);
	return diff.exitCode === 0
		? diff.stdout.split("\n").filter((line) => line !== "")
		: [];
}

/**
 * Clone into a directory DataGripe owns.
 *
 * The URL has already been through the SSRF policy and the scheme
 * allowlist by the time it gets here — see `assertCloneUrl`.
 */
export async function clone(
	url: string,
	branch: string | undefined,
	target: string,
	options: GitOptions,
	audit: Omit<RepoAudit, "connectionRef">,
): Promise<string> {
	log.audit("git.clone", { ...audit, url, target, branch: branch ?? null });
	const args = ["clone"];
	if (branch !== undefined) {
		args.push("--branch", branch);
	}
	// `--` so a URL beginning with a dash is a URL.
	args.push("--", url, target);
	// cwd is the parent: the target does not exist yet.
	const result = await run(path.dirname(target), args, options);
	if (result.exitCode !== 0) {
		// A failed clone leaves a partial directory behind often enough to
		// be worth cleaning: the next attempt would fail on "not empty"
		// with a message about the wrong problem.
		await rm(target, { recursive: true, force: true }).catch(() => {});
		throw new ServiceError(
			ErrorCodes.BadRequest,
			result.stderr.trim() === ""
				? `git clone failed with exit ${result.exitCode}`
				: result.stderr.trim(),
		);
	}
	return workTreeRoot(target, options);
}
