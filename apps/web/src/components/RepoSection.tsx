import { GIT_STATUS_MAX_ENTRIES } from "@datagripe/contracts";
import { useEffect, useState } from "react";
import type { EditorDocument } from "../stores/documents";
import { useRepoStore } from "../stores/git";
import { openRepoFile } from "../stores/openRepoFile";
import { useConnectionsStore } from "../stores/runtime";
import { Button, TextInput } from "./controls";
import { IconRefresh } from "./icons";
import { RepoCommands } from "./RepoCommands";

/**
 * The repository section (docs/spec/git-datasources.md
 * "The repository section").
 *
 * Branch, what has changed, and the three buttons. Everything in here
 * is a press: editing a file does not commit it, saving does not push,
 * and nothing refreshes on a timer.
 *
 * The branch and the refresh live in the section *header*
 * (`RepoHeader`), where they are legible whether or not the section is
 * open — "which branch am I on" is the question people ask without
 * wanting the file list, and it used to cost a click and two rows of
 * panel. What is left inside is one line of counts and the buttons,
 * with the ahead/behind counts on `push` and `pull` themselves rather
 * than in a pair of arrows above them: the count belongs to the press
 * that changes it.
 *
 * The status list is the whole work tree, not the datasource's
 * configured paths. This is a repository view, and hiding a changed file
 * because it sits outside a path pair is how you commit half of
 * something.
 */

/**
 * The branch, the change count and refresh, in the section header
 * (`SidebarSection.actions`).
 *
 * Separate from the panel because it outlives it: the panel mounts when
 * somebody opens the section, and the branch is worth knowing when it
 * is shut. It reads the status the panel already loaded and does not
 * load one of its own — nothing here polls.
 */
export function RepoHeader(props: { connectionRef: string }) {
	const { connectionRef } = props;
	const status = useRepoStore((state) => state.status[connectionRef]);
	const loading = useRepoStore(
		(state) => state.loading[connectionRef] === true,
	);
	const busy = useRepoStore((state) => state.busy[connectionRef]);
	const changed = status?.total ?? 0;

	return (
		<>
			<span className="dg-repo-chip" title={status?.repoPath}>
				{status?.branch ?? "…"}
			</span>
			{changed > 0 && (
				<span
					className="dg-count"
					title={`${changed} changed ${changed === 1 ? "file" : "files"}`}
				>
					{changed}
				</span>
			)}
			<button
				type="button"
				className="dg-section-icon"
				title={
					status?.upstream == null
						? "Read the status again"
						: `Fetch ${status.upstream} and read the status again`
				}
				aria-label="Refresh the repository"
				disabled={loading || busy !== undefined}
				onClick={(event) => {
					// The header row toggles the section; refreshing is not
					// asking for it to close.
					event.stopPropagation();
					void useRepoStore.getState().refresh(connectionRef);
				}}
			>
				<IconRefresh />
			</button>
		</>
	);
}

export interface RepoSectionProps {
	connectionRef: string;
	/** For the run tab's title. */
	datasourceName: string;
	/** Clicking a row opens the file, when the sidebar can reach it. */
	onOpen?: (doc: EditorDocument) => void;
}

export function RepoSection(props: RepoSectionProps) {
	const { connectionRef } = props;
	const status = useRepoStore((state) => state.status[connectionRef]);
	const loading = useRepoStore(
		(state) => state.loading[connectionRef] === true,
	);
	const error = useRepoStore((state) => state.errors[connectionRef]);
	const selected = useRepoStore((state) => state.selected[connectionRef]);
	const output = useRepoStore((state) => state.output[connectionRef]);
	const busy = useRepoStore((state) => state.busy[connectionRef]);
	const [message, setMessage] = useState("");
	const [composing, setComposing] = useState(false);
	const [openError, setOpenError] = useState<string | null>(null);
	const connection = useConnectionsStore((state) =>
		state.connections.find((entry) => entry.id === connectionRef),
	);

	/**
	 * A row names a file the way git does: relative to the work tree root.
	 * The editor names files relative to a configured path pair. A file
	 * outside every pair is not reachable from here, and says so rather
	 * than opening something else.
	 */
	const openRow = async (repoRelative: string) => {
		setOpenError(null);
		if (connection === undefined || status === undefined) {
			return;
		}
		try {
			const doc = await openRepoFile(connection, status.repoPath, repoRelative);
			if (doc === null) {
				setOpenError(
					`${repoRelative} is not under any of this datasource's paths — add it to .datagripe/config.yaml to open it here.`,
				);
				return;
			}
			props.onOpen?.(doc);
		} catch (cause) {
			setOpenError(
				cause instanceof Error ? cause.message : "Could not open that file",
			);
		}
	};

	useEffect(() => {
		void useRepoStore.getState().load(connectionRef);
	}, [connectionRef]);

	const ticked = selected ?? [];

	if (error !== undefined && status === undefined) {
		return (
			<div className="dg-repo">
				<p className="dg-sidebar-empty dg-test-failed">{error}</p>
				<Button
					size="sm"
					onClick={() => void useRepoStore.getState().load(connectionRef)}
				>
					try again
				</Button>
			</div>
		);
	}

	return (
		<div className="dg-repo">
			{status !== undefined && (
				// One line instead of a header: what is changed, how much of
				// it is going in the next commit, and whether there is
				// anywhere to push it.
				<p className="dg-repo-summary">
					<b>{status.total}</b> changed
					{ticked.length > 0 && (
						<>
							{" "}
							· <b>{ticked.length}</b> staged
						</>
					)}
					{status.upstream === null && (
						<span className="dg-dim"> · no upstream</span>
					)}
				</p>
			)}

			{error !== undefined && (
				<p className="dg-sidebar-empty dg-test-failed">{error}</p>
			)}
			{openError !== null && (
				<p className="dg-sidebar-empty dg-test-failed">{openError}</p>
			)}

			{status === undefined ? (
				<p className="dg-sidebar-empty">
					{loading ? "Reading…" : "Not loaded."}
				</p>
			) : status.entries.length === 0 ? (
				<p className="dg-sidebar-empty">Nothing changed.</p>
			) : (
				<>
					{status.truncated && (
						<p className="dg-sidebar-empty">
							{status.total} changed files — too many to tick through here. Use
							a terminal; the first {GIT_STATUS_MAX_ENTRIES} are listed.
						</p>
					)}
					<ul className="dg-repo-list">
						{status.entries.map((entry) => (
							<li key={entry.path} className="dg-repo-row">
								<label className="dg-repo-check">
									<TextInput
										type="checkbox"
										checked={ticked.includes(entry.path)}
										onChange={() =>
											useRepoStore.getState().toggle(connectionRef, entry.path)
										}
									/>
									{/* Git's own letters, unabbreviated. People who use git
										    read `??` already, and people who do not are not
										    served by an invented word. */}
									<code className="dg-repo-status">
										{entry.status.replaceAll(" ", "·")}
									</code>
								</label>
								<button
									type="button"
									className="dg-repo-path"
									title={
										entry.originalPath === null
											? entry.path
											: `${entry.originalPath} → ${entry.path}`
									}
									onClick={() => void openRow(entry.path)}
								>
									{entry.path}
								</button>
							</li>
						))}
					</ul>
				</>
			)}

			<div className="dg-repo-actions">
				{composing ? (
					<div className="dg-repo-compose">
						<textarea
							className="dg-repo-message"
							rows={2}
							placeholder="Commit message"
							value={message}
							onChange={(event) => setMessage(event.target.value)}
						/>
						<div className="dg-repo-buttons">
							<Button
								size="sm"
								tone="primary"
								disabled={message.trim() === "" || busy !== undefined}
								onClick={() => {
									void useRepoStore
										.getState()
										.commit(connectionRef, message)
										.then(() => {
											if (
												useRepoStore.getState().output[connectionRef]
													?.exitCode === 0
											) {
												setMessage("");
												setComposing(false);
											}
										});
								}}
							>
								commit {ticked.length > 0 ? `(${ticked.length})` : ""}
							</Button>
							<Button size="sm" onClick={() => setComposing(false)}>
								cancel
							</Button>
						</div>
					</div>
				) : (
					<div className="dg-repo-buttons">
						<Button
							size="sm"
							tone="primary"
							disabled={busy !== undefined}
							onClick={() => setComposing(true)}
						>
							commit…
						</Button>
						{/* The only button here that leaves the machine, which is
							    why it is always its own press. The number on it is
							    what it would send. */}
						<Button
							size="sm"
							disabled={busy !== undefined}
							title={
								status?.upstream === null
									? "No upstream yet — this sets one"
									: `Push to ${status?.upstream}`
							}
							onClick={() =>
								void useRepoStore
									.getState()
									.push(connectionRef, status?.upstream === null)
							}
						>
							{busy === "push" ? "pushing…" : "push"}
							{status !== undefined && status.upstream !== null && (
								<span className="dg-repo-n">{status.ahead}</span>
							)}
						</Button>
						<Button
							size="sm"
							disabled={busy !== undefined}
							title={
								status?.upstream === null
									? "Nothing to pull from — no upstream"
									: `Pull from ${status?.upstream}`
							}
							onClick={() => void useRepoStore.getState().pull(connectionRef)}
						>
							{busy === "pull" ? "pulling…" : "pull"}
							{status !== undefined && status.upstream !== null && (
								<span className="dg-repo-n">{status.behind}</span>
							)}
						</Button>
					</div>
				)}
			</div>

			{/* Commands the repository declares, behind their own approval
				    (docs/spec/repo-commands.md). Below the git buttons because
				    they are a different kind of thing: git moves files around,
				    this runs a program. */}
			<RepoCommands
				connectionRef={connectionRef}
				datasourceName={props.datasourceName}
			/>

			{/* Git's verdict, verbatim: no interpretation, no "something went
				    wrong". A push that failed for want of credentials shows
				    exactly what git said about it. */}
			{output !== undefined && (
				<div className="dg-repo-output">
					<p className="dg-repo-exit">
						exit {output.exitCode}
						{output.commitSha !== null && ` · ${output.commitSha.slice(0, 8)}`}
					</p>
					{output.stdout !== "" && <pre>{output.stdout}</pre>}
					{output.stderr !== "" && (
						<pre className="dg-sync-stderr">{output.stderr}</pre>
					)}
				</div>
			)}
		</div>
	);
}
