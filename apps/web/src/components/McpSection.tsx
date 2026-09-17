import { useEffect, useState } from "react";
import { useMcpStore } from "../stores/mcp";
import { useCan, useSessionStore } from "../stores/session";
import { Button, TextInput } from "./controls";

/**
 * The MCP panel (docs/spec/mcp.md "The panel").
 *
 * Owner-only dock tab, opened from the sidebar title. The shared switch
 * remains reachable in the sidebar header. What the tab adds:
 * what mode it is in, that the mode is a ceiling rather than a grant
 * because a datasource marked `read only` stays read-only however this
 * is set, where to point a client, and which tokens exist.
 */

/**
 * The switch and what it means, in the section header
 * (`SidebarSection.actions`).
 *
 * Separate from the panel because it outlives it: the panel mounts when
 * somebody opens the tab, and this has to say whether an agent can
 * reach the project whether or not anybody ever does. It reads
 * `status` — one settings row and a count — rather than the panel's
 * whole state.
 *
 * Three states, three colours, and the words are there for the third of
 * men who cannot tell two of them apart (brand-system.md
 * "Accessibility"): **no tokens** is grey, because a server nothing can
 * connect to is on in name only; **read only** is green; **read/write**
 * is violet, because an agent that can commit its own changes to your
 * database is not the same fact and should not wear the same colour as
 * the safe one.
 */
export function McpSwitch() {
	const status = useMcpStore((store) => store.status);
	const busy = useMcpStore((store) => store.busy);

	if (status === null) {
		return null;
	}

	const pill =
		status.tokenCount === 0
			? { label: "no tokens", className: "" }
			: status.mode === "read-write"
				? { label: "read/write", className: " dg-mcp-pill-write" }
				: { label: "read only", className: " dg-mcp-pill-read" };

	return (
		<>
			{status.enabled && (
				<span
					className={`dg-mcp-pill${pill.className}`}
					title={
						status.tokenCount === 0
							? "On, but no token exists — nothing can connect yet"
							: `${status.tokenCount} ${status.tokenCount === 1 ? "token" : "tokens"} can connect, ${pill.label}`
					}
				>
					{pill.label}
				</span>
			)}
			<button
				type="button"
				className="dg-sw"
				aria-pressed={status.enabled}
				aria-label="MCP server"
				disabled={busy}
				title={
					status.enabled
						? "On — an agent with a token can read this project"
						: "Off — nothing is listening for this project"
				}
				onClick={() =>
					void useMcpStore
						.getState()
						.setSettings({ enabled: !status.enabled, mode: status.mode })
				}
			>
				<i />
			</button>
		</>
	);
}

/** How long "copied" stays on a button before it goes back to itself. */
const COPIED_MS = 1200;

function relative(iso: string | null): string {
	if (iso === null) {
		return "never used";
	}
	const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
	if (seconds < 60) {
		return "used just now";
	}
	if (seconds < 3600) {
		return `used ${Math.round(seconds / 60)}m ago`;
	}
	if (seconds < 86_400) {
		return `used ${Math.round(seconds / 3600)}h ago`;
	}
	return `used ${Math.round(seconds / 86_400)}d ago`;
}

export function McpSection() {
	const canManage = useCan("mcp.manage");
	const state = useMcpStore((store) => store.state);
	const loading = useMcpStore((store) => store.loading);
	const busy = useMcpStore((store) => store.busy);
	const error = useMcpStore((store) => store.error);
	const revealed = useMcpStore((store) => store.revealed);
	const project = useSessionStore((store) => store.currentWorkspace);
	const [copied, setCopied] = useState<string | null>(null);
	const [name, setName] = useState("");

	// Full settings are loaded only when the management tab opens.
	useEffect(() => {
		if (canManage) void useMcpStore.getState().load();
		return () => useMcpStore.getState().dismissRevealed();
	}, [canManage]);

	const copy = (key: string, text: string) => {
		void navigator.clipboard?.writeText(text).then(() => {
			setCopied(key);
			setTimeout(
				() => setCopied((current) => (current === key ? null : current)),
				COPIED_MS,
			);
		});
	};

	if (!canManage)
		return (
			<p className="dg-sidebar-empty">MCP management requires owner access.</p>
		);
	if (state === null) {
		return (
			<p className="dg-sidebar-empty">
				{loading ? "Loading…" : (error ?? "Nothing to show yet.")}
			</p>
		);
	}

	/**
	 * The snippet a client wants. The token is only in it at creation
	 * time — after that there is a placeholder, because a value that was
	 * never stored cannot be shown twice.
	 */
	const clientConfig = JSON.stringify(
		{
			mcpServers: {
				[`datagripe-${(project?.name ?? "project").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`]:
					{
						type: "http",
						url: state.url,
						headers: {
							Authorization: `Bearer ${revealed?.value ?? "<your token>"}`,
						},
					},
			},
		},
		null,
		2,
	);

	const readOnlyDatasources = state.datasources.filter(
		(entry) => entry.readOnly,
	);

	return (
		<div className="dg-mcp dg-scroll">
			<h2>MCP Server</h2>
			<div>
				<McpSwitch />
			</div>
			{!state.enabled && (
				<p className="dg-mcp-lead">
					Nothing is listening for this project. Enable it here or in the
					sidebar.
				</p>
			)}
			{/* The ceiling first: everything below is about who reaches
						  the project, and this is what they get when they do. */}
			<fieldset className="dg-seg dg-mcp-seg" aria-label="Access">
				<button
					type="button"
					aria-pressed={state.mode === "read-only"}
					disabled={busy}
					onClick={() =>
						void useMcpStore
							.getState()
							.setSettings({ enabled: state.enabled, mode: "read-only" })
					}
				>
					read only
				</button>
				<button
					type="button"
					aria-pressed={state.mode === "read-write"}
					disabled={busy}
					onClick={() =>
						void useMcpStore
							.getState()
							.setSettings({ enabled: state.enabled, mode: "read-write" })
					}
				>
					read/write
				</button>
			</fieldset>
			<p className="dg-mcp-note">
				{state.mode === "read-only"
					? "Writes are refused before they reach the database, and every query runs in a transaction that is rolled back."
					: "Every query an agent runs commits."}
			</p>
			{/* The ceiling, named. Flipping this switch does not lift a
						  datasource's own read-only setting, and finding that out
						  from a failed query is a worse way to learn it. */}
			{state.mode === "read-write" && readOnlyDatasources.length > 0 && (
				<p className="dg-mcp-note dg-mcp-ceiling">
					Still read-only, by their own setting:{" "}
					{readOnlyDatasources.map((entry) => entry.name).join(", ")}.
				</p>
			)}
			\t\t\t\t\t<p className="dg-mcp-head">functionality</p>
			{(
				[
					["domainsEnabled", "Manage domains and object assignments"],
					["syncEnabled", "Sync datasource to files"],
					["gitEnabled", "Git status, commit and push"],
				] as const
			).map(([key, label]) => (
				<div key={key}>
					<Button
						size="sm"
						aria-pressed={state[key]}
						disabled={busy}
						onClick={() =>
							void useMcpStore.getState().setSettings({
								enabled: state.enabled,
								mode: state.mode,
								[key]: !state[key],
							})
						}
					>
						{state[key] ? "Disable" : "Enable"} {label}
					</Button>
				</div>
			))}
			<p className="dg-mcp-note">
				Domain changes, sync writes and Git commits/pushes also require
				read/write mode and an editor account. Sync exports the configured
				datasource snapshot; it does not pull Git changes.
			</p>
			<p className="dg-mcp-head">tokens</p>
			{revealed !== null && (
				<div className="dg-mcp-revealed">
					<p>
						<b>{revealed.name}</b> — copy it now. This is the only time it is
						shown; DataGripe kept a hash, not the token.
					</p>
					<code>{revealed.value}</code>
					<div className="dg-repo-buttons">
						<Button
							size="sm"
							tone="primary"
							onClick={() => copy("token", revealed.value)}
						>
							{copied === "token" ? "copied" : "copy token"}
						</Button>
						<Button
							size="sm"
							onClick={() => useMcpStore.getState().dismissRevealed()}
						>
							done
						</Button>
					</div>
				</div>
			)}
			<ul className="dg-mcp-tokens">
				{state.tokens.map((token) => (
					<li key={token.id}>
						<span className="dg-mcp-token-name">{token.name}</span>
						<span className="dg-mcp-token-meta">
							{relative(token.lastUsedAt)}
						</span>
						<Button
							size="sm"
							tone="danger"
							disabled={busy}
							onClick={() => {
								if (
									window.confirm(
										`Revoke "${token.name}"? Any agent using it stops working immediately.`,
									)
								) {
									void useMcpStore.getState().revokeToken(token.id);
								}
							}}
						>
							revoke
						</Button>
					</li>
				))}
				{state.tokens.length === 0 && (
					<li className="dg-mcp-token-meta">
						No tokens yet — nothing can connect.
					</li>
				)}
			</ul>
			<form
				className="dg-mcp-new"
				onSubmit={(event) => {
					event.preventDefault();
					if (name.trim() === "") {
						return;
					}
					void useMcpStore
						.getState()
						.createToken(name.trim())
						.then(() => setName(""));
				}}
			>
				<TextInput
					type="text"
					value={name}
					maxLength={60}
					placeholder="name this token…"
					aria-label="New token name"
					onChange={(event) => setName(event.target.value)}
				/>
				<Button
					type="submit"
					size="sm"
					tone="primary"
					disabled={busy || name.trim() === ""}
				>
					create
				</Button>
			</form>
			<p className="dg-mcp-head">
				endpoint
				<button
					type="button"
					className="dg-mcp-copy"
					onClick={() => copy("url", state.url)}
				>
					{copied === "url" ? "copied" : "copy uri"}
				</button>
			</p>
			<code className="dg-mcp-url">{state.url}</code>
			<Button
				size="sm"
				tone="primary"
				className="dg-mcp-config"
				onClick={() => copy("config", clientConfig)}
			>
				{copied === "config" ? "copied" : "copy client config"}
			</Button>
			<p className="dg-mcp-status">
				{state.mode === "read-only" ? "read only" : "read/write"} ·{" "}
				{state.datasources.length}{" "}
				{state.datasources.length === 1 ? "datasource" : "datasources"} ·{" "}
				{state.fileCount} {state.fileCount === 1 ? "file" : "files"}
				{state.instructionsSource === null
					? ""
					: ` · briefing from ${state.instructionsSource}`}
			</p>
			{error !== null && <p className="dg-test-failed">{error}</p>}
		</div>
	);
}
