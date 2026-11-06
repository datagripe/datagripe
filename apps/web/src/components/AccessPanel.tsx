import type {
	AccessReportResult,
	AccessRolesResult,
	DatasourceRole,
	Finding,
} from "@datagripe/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { wsClient } from "../api/ws";
import {
	openDomainManager,
	openObjectView,
	openSyncPanel,
	readDatasourcePanelParams,
} from "../app/viewPanels";
import { useGripesStore } from "../stores/gripes";
import { AccessMatrix, visibleObjects } from "./AccessMatrix";
import { Select, TextInput } from "./controls";
import { RailFact, RailHelp, RailSection, TabShell } from "./TabRail";

/**
 * The access report (docs/spec/access-report.md).
 *
 * A tab you read, scroll and keep open beside a query while you fix
 * things — not a modal. Every cell is *effective* access, so `PUBLIC`,
 * role inheritance and ownership are already resolved; the `°` marker
 * and its path are what turns "anon can read this" into "anon can read
 * this because somebody granted it to PUBLIC three years ago".
 */

type ReportResponse = AccessReportResult & {
	findings: Finding[];
	untrusted: string[];
};

export function AccessPanel(props: { params?: unknown }) {
	const { connectionRef, connectionName } = readDatasourcePanelParams(
		props.params,
	);
	const [roles, setRoles] = useState<AccessRolesResult | null>(null);
	const [report, setReport] = useState<ReportResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [differencesOnly, setDifferencesOnly] = useState(false);
	const [domainFilter, setDomainFilter] = useState("");
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const setObjectFindings = useGripesStore((state) => state.setObjectFindings);

	const loadRoles = useCallback(async () => {
		try {
			setRoles(
				await wsClient.request<AccessRolesResult>("access.roles", {
					connectionId: connectionRef,
				}),
			);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Could not read the roles",
			);
		}
	}, [connectionRef]);

	useEffect(() => {
		if (connectionRef !== "") {
			void loadRoles();
		}
	}, [connectionRef, loadRoles]);

	const mark = async (
		role: DatasourceRole,
		changes: Partial<
			Pick<DatasourceRole, "untrusted" | "authenticator" | "shown">
		>,
	) => {
		const next = { ...role, ...changes };
		setRoles(
			await wsClient.request<AccessRolesResult>("access.roles.set", {
				connectionId: connectionRef,
				roles: [
					{
						name: next.name,
						untrusted: next.untrusted,
						authenticator: next.authenticator,
						shown: next.shown,
					},
				],
				idempotencyKey: crypto.randomUUID(),
			}),
		);
	};

	const run = async () => {
		setBusy(true);
		setError(null);
		try {
			const result = await wsClient.request<ReportResponse>("access.report", {
				connectionId: connectionRef,
				schemas: [],
				countOnly: false,
			});
			setReport(result);
			// The findings go into the same store as every other gripe, so
			// the panel and the status-bar count see them too. Grouped by
			// object first: `setObjectFindings` replaces a key's whole list,
			// so calling it per finding would keep only the last one.
			const byObject = new Map<string, Finding[]>();
			for (const finding of result.findings) {
				if (finding.at.kind !== "object") {
					continue;
				}
				const key = `object:${finding.at.schema}.${finding.at.name}`;
				byObject.set(key, [...(byObject.get(key) ?? []), finding]);
			}
			for (const [key, findings] of byObject) {
				setObjectFindings(key, findings);
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Report failed");
		} finally {
			setBusy(false);
		}
	};

	const shownObjects = useMemo(
		() =>
			report === null
				? []
				: visibleObjects(report, { differencesOnly, domain: domainFilter }),
		[report, differencesOnly, domainFilter],
	);

	if (connectionRef === "") {
		return (
			<div className="dg-form dg-scroll">
				<div className="dg-form-body">
					<h3 className="dg-form-title">Access</h3>
					<p className="dg-form-lead">No datasource selected.</p>
				</div>
			</div>
		);
	}

	const columns = report?.roles ?? [];
	const domains = [
		...new Set(
			(report?.objects ?? [])
				.map((object) => object.domain)
				.filter((name): name is string => name !== null),
		),
	].sort();
	const suggested = (roles?.roles ?? []).filter(
		(role) => role.suggestedUntrusted,
	);
	const anyUntrusted = (roles?.roles ?? []).some((role) => role.untrusted);

	const stateRail = (
		<>
			<RailSection title="report">
				<RailFact label="roles shown" value={columns.length} />
				<RailFact label="objects" value={report?.objects.length ?? 0} />
				<RailFact label="cells" value={report?.cellCount ?? 0} />
				<RailFact
					label="findings"
					value={report?.findings.length ?? 0}
					tone={
						report === null ? "dim" : report.findings.length > 0 ? "bad" : "ok"
					}
				/>
				<RailFact
					label="untrusted"
					value={
						report === null || report.untrusted.length === 0
							? "none marked"
							: report.untrusted.join(", ")
					}
					tone={
						report !== null && report.untrusted.length === 0 ? "dim" : undefined
					}
				/>
			</RailSection>
			{report !== null && report.untrusted.length === 0 && (
				<RailSection title="why no findings">
					<p className="dg-rail-help">
						Every <code>grant.*</code> rule stays silent until a role is marked
						untrusted. Guessing which one is the anonymous role would either
						flood this report or silence the one that mattered.
					</p>
				</RailSection>
			)}
		</>
	);

	const help = (
		<RailHelp>
			<p>
				What each role can <em>actually</em> do. Answers come from PostgreSQL's
				own <code>has_*_privilege</code>, so grants to <code>PUBLIC</code>,
				grants inherited through a role and ownership are already resolved. A
				scan of direct grants misses all three.
			</p>
			<dl>
				<dt>°</dt>
				<dd>
					Reachable without a direct grant to that role. Hover the cell for the
					path — <code>via PUBLIC</code>, <code>via member of …</code>,{" "}
					<code>owner</code>. That sentence is the point of the report.
				</dd>
				<dt>struck through</dt>
				<dd>
					Granted, but the role has no <code>USAGE</code> on the schema, so it
					is not access. Shown rather than hidden: "granted but unreachable" and
					"not granted" are different facts.
				</dd>
				<dt>untrusted</dt>
				<dd>
					The PostgREST anonymous role. Marking one turns on the{" "}
					<code>grant.*</code> rules, which is where findings come from.
				</dd>
				<dt>authenticator</dt>
				<dd>
					Marking one adds every role it can <code>SET ROLE</code> to — the
					identities a request can actually arrive as.
				</dd>
				<dt>differences only</dt>
				<dd>
					Hides rows where nothing is reachable without a direct grant, and
					column rows that only repeat their table's cell. On a mature database
					that toggle is the report.
				</dd>
				<dt>col</dt>
				<dd>
					Column-level grants exist, which a table's cell rounds off. Press it
					to list each column under the row with the same letters —{" "}
					<code>GRANT SELECT (email) ON users TO support</code> reads{" "}
					<code>–</code> on the table and <code>R</code> on <code>email</code>.
				</dd>
			</dl>
			<p>
				Findings appear in the gripes panel too, and the whole report is written
				to <code>access/</code> in the domain dump.
			</p>
			<button
				type="button"
				className="dg-rail-link"
				onClick={() => openDomainManager(connectionRef)}
			>
				domains → group this report by domain
			</button>
			<br />
			<button
				type="button"
				className="dg-rail-link"
				onClick={() => openSyncPanel(connectionRef, connectionName)}
			>
				sync → commit it alongside the schema
			</button>
		</RailHelp>
	);

	return (
		<TabShell
			className="dg-form-body dg-form-wide dg-access"
			rail={[
				{ id: "state", label: "state", node: stateRail },
				{ id: "help", label: "help", node: help },
			]}
		>
			<h3 className="dg-form-title">access: {connectionName}</h3>
			<p className="dg-form-lead">
				Effective privileges, not granted ones. Grants to <code>PUBLIC</code>,
				grants inherited through a role and ownership are already resolved — a
				direct-grant scan misses all three.
			</p>

			<section className="dg-access-roles">
				<h4>roles</h4>
				{roles === null && <p className="dg-tree-note">loading…</p>}
				{!anyUntrusted && suggested.length > 0 && (
					// Suggested, never assumed: guessing wrong either floods the
					// report or silences the one role that mattered.
					<p className="dg-access-suggest">
						{suggested.map((role) => role.name).join(", ")} look like anonymous
						roles. Mark one untrusted to turn the <code>grant.*</code> rules on.
					</p>
				)}
				<table className="dg-domain-table">
					<thead>
						<tr>
							<th>role</th>
							<th>flags</th>
							<th>member of</th>
							<th title="Show as a column in the matrix">column</th>
							<th title="The PostgREST anonymous role">untrusted</th>
							<th title="Requests arrive as any role this one can SET ROLE to">
								authenticator
							</th>
						</tr>
					</thead>
					<tbody>
						{(roles?.roles ?? []).map((role) => (
							<tr key={role.name}>
								<td>{role.name}</td>
								<td className="dg-access-flags">
									{role.superuser && <span title="superuser">SU</span>}
									{role.bypassRls && <span title="bypasses RLS">BR</span>}
									{role.canLogin && <span title="can log in">LOGIN</span>}
									{!role.inherit && (
										<span title="does not inherit privileges">NOINH</span>
									)}
								</td>
								<td className="dg-access-memberof">
									{role.memberOf.join(", ") || "—"}
								</td>
								<td>
									<TextInput
										type="checkbox"
										checked={role.shown}
										aria-label={`Show ${role.name} as a column`}
										onChange={(event) =>
											void mark(role, { shown: event.target.checked })
										}
									/>
								</td>
								<td>
									<TextInput
										type="checkbox"
										checked={role.untrusted}
										aria-label={`Mark ${role.name} untrusted`}
										onChange={(event) =>
											void mark(role, { untrusted: event.target.checked })
										}
									/>
								</td>
								<td>
									<TextInput
										type="checkbox"
										checked={role.authenticator}
										aria-label={`Mark ${role.name} the authenticator`}
										onChange={(event) =>
											void mark(role, {
												authenticator: event.target.checked,
											})
										}
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{roles !== null && roles.authenticatorReach.length > 0 && (
					<p className="dg-access-reach">
						A request can arrive as: {roles.authenticatorReach.join(", ")}
					</p>
				)}
			</section>

			<div className="dg-sync-actions">
				<button type="button" disabled={busy} onClick={() => void run()}>
					{busy ? "reading…" : "run report"}
				</button>
				{report !== null && (
					<>
						<label>
							<TextInput
								type="checkbox"
								checked={differencesOnly}
								onChange={(event) => setDifferencesOnly(event.target.checked)}
							/>{" "}
							differences only
						</label>
						{domains.length > 0 && (
							<Select
								value={domainFilter}
								aria-label="Filter by domain"
								onChange={(event) => setDomainFilter(event.target.value)}
							>
								<option value="">every domain</option>
								{domains.map((name) => (
									<option key={name} value={name}>
										{name}
									</option>
								))}
							</Select>
						)}
					</>
				)}
			</div>

			{error !== null && <div className="dg-modal-error">{error}</div>}

			{report !== null && (
				<>
					<p className="dg-access-legend">
						<code>R</code> select · <code>C</code> insert · <code>U</code>{" "}
						update · <code>D</code> delete · <code>X</code> execute ·{" "}
						<code>°</code> reachable without a direct grant ·{" "}
						<span className="dg-access-blocked">struck</span> no schema USAGE,
						so the privilege is inert
					</p>

					<AccessMatrix
						report={report}
						objects={shownObjects}
						differencesOnly={differencesOnly}
						expanded={expanded}
						onToggle={(key) =>
							setExpanded((current) => {
								const next = new Set(current);
								if (!next.delete(key)) {
									next.add(key);
								}
								return next;
							})
						}
						onOpen={(object) =>
							openObjectView(
								{
									connectionId: connectionRef,
									schema: object.schema,
									name: object.name,
									kind: object.kind,
								},
								"grants",
							)
						}
					/>

					{report.defaultAcl.length > 0 && (
						<section>
							<h4>default privileges</h4>
							<p className="dg-form-lead">
								What the <em>next</em> object gets — the difference between an
								audit you do once and one you do forever.
							</p>
							<table className="dg-domain-table">
								<thead>
									<tr>
										<th>created by</th>
										<th>schema</th>
										<th>type</th>
										<th>grantee</th>
										<th>privileges</th>
									</tr>
								</thead>
								<tbody>
									{report.defaultAcl.map((entry) => (
										<tr
											key={`${entry.owner}/${entry.schema}/${entry.objectType}/${entry.grantee}`}
										>
											<td>{entry.owner}</td>
											<td>{entry.schema ?? "(all)"}</td>
											<td>{entry.objectType}</td>
											<td
												className={
													report.untrusted.includes(entry.grantee) ||
													entry.grantee === "PUBLIC"
														? "dg-access-warn"
														: undefined
												}
											>
												{entry.grantee}
											</td>
											<td>{entry.privileges.join(", ")}</td>
										</tr>
									))}
								</tbody>
							</table>
						</section>
					)}

					<p className="dg-modal-note">
						{report.cellCount} cells · {report.findings.length} finding
						{report.findings.length === 1 ? "" : "s"} in the gripes panel
					</p>
				</>
			)}
		</TabShell>
	);
}
