import type {
	AccessCell,
	AccessObject,
	AccessReportResult,
	ColumnGrant,
	Privilege,
} from "@datagripe/contracts";
import { Button } from "./controls";

/**
 * The access matrix itself (docs/spec/access-report.md "The matrix").
 *
 * Kept apart from `AccessPanel` and free of the dock and the socket so
 * it renders in a test: which rows show, and what an expanded relation
 * says about its columns, is the part of the report a wrong answer in
 * would cost somebody, so it is the part that is pinned.
 */

export const LETTERS: Record<string, string> = {
	select: "R",
	insert: "C",
	update: "U",
	delete: "D",
	execute: "X",
	usage: "G",
};

function letters(privileges: Privilege[]): string {
	return privileges.map((p) => LETTERS[p] ?? p).join("");
}

function cellText(entry: AccessCell | undefined): string {
	if (entry === undefined || entry.privileges.length === 0) {
		return "–";
	}
	return letters(entry.privileges);
}

function Cell(props: { entry: AccessCell | undefined }) {
	const entry = props.entry;
	if (entry === undefined || entry.privileges.length === 0) {
		return <td className="dg-access-none">–</td>;
	}
	const indirect = entry.path !== null && !entry.sources.includes("direct");
	return (
		<td
			className={
				entry.schemaBlocked
					? "dg-access-blocked"
					: indirect
						? "dg-access-indirect"
						: undefined
			}
			// The path is the product. Markdown gets a Paths table; here it
			// is the title, which screen readers also announce.
			title={
				entry.schemaBlocked
					? `${cellText(entry)} — but no USAGE on the schema, so this is not access`
					: (entry.path ?? undefined)
			}
		>
			{cellText(entry)}
			{indirect && <span aria-hidden>°</span>}
		</td>
	);
}

function isRoutine(object: AccessObject): boolean {
	return object.kind === "function" || object.kind === "procedure";
}

export function objectKey(object: AccessObject): string {
	return `${object.kind}:${object.schema}.${object.name}`;
}

/** One column of one relation: its privileges per role. */
export type ColumnRow = {
	column: string;
	byRole: Map<string, Privilege[]>;
};

/**
 * The payload lists one grant per (column, role); the matrix wants one
 * row per column. Roles with no privilege on a column have no entry,
 * which renders as `–` exactly like an empty relation cell.
 */
export function columnRows(grants: ColumnGrant[]): ColumnRow[] {
	const rows = new Map<string, ColumnRow>();
	for (const grant of grants) {
		const row = rows.get(grant.column) ?? {
			column: grant.column,
			byRole: new Map(),
		};
		row.byRole.set(grant.role, grant.privileges);
		rows.set(grant.column, row);
	}
	return [...rows.values()];
}

/**
 * Whether a column row says something its relation's row does not.
 *
 * The relation filter keeps access nobody granted by name; a column row
 * has no path to judge that by (`has_column_privilege` answers yes or
 * no), so its difference is the one the `col` note warns about: a
 * shown role whose privileges on this column are not the ones its
 * relation cell shows. `GRANT SELECT (email) ON users TO support` is
 * exactly that — `support` reads `–` on the table and `R` on `email`.
 * A column that merely repeats the table grant is the noise the toggle
 * exists to remove.
 */
export function columnRowDiffers(
	row: ColumnRow,
	object: AccessObject,
	roles: string[],
): boolean {
	return roles.some((role) => {
		const cell = object.cells.find((entry) => entry.role === role);
		const onObject = new Set<string>(cell?.privileges ?? []);
		const onColumn = row.byRole.get(role) ?? [];
		// Column privileges are a subset of select/insert/update, so only
		// those three of the object's are comparable; `delete` on the
		// table is not a difference the column row can show.
		const comparable = ["select", "insert", "update"].filter((p) =>
			onObject.has(p),
		);
		return (
			onColumn.length !== comparable.length ||
			onColumn.some((p) => !onObject.has(p))
		);
	});
}

function columnKey(schema: string, name: string): string {
	return `${schema}\u0000${name}`;
}

/** Column grants by relation, for the rows that have any. */
export function columnGrantIndex(
	report: Pick<AccessReportResult, "columnGrants">,
): Map<string, ColumnGrant[]> {
	return new Map(
		report.columnGrants.map((entry) => [
			columnKey(entry.schema, entry.name),
			entry.grants,
		]),
	);
}

function grantsFor(
	index: Map<string, ColumnGrant[]>,
	object: AccessObject,
): ColumnGrant[] {
	return index.get(columnKey(object.schema, object.name)) ?? [];
}

/**
 * The rows the matrix shows. "Differences only" keeps a relation when
 * any cell is reachable without a direct grant — and, since the toggle
 * is meant to be the report on a mature database, when one of its
 * columns says something the relation's cells do not. Without the
 * second clause the column-only grant would be filtered out by the
 * very toggle meant to surface it.
 */
export function visibleObjects(
	report: Pick<AccessReportResult, "objects" | "columnGrants" | "roles">,
	options: { differencesOnly: boolean; domain: string },
): AccessObject[] {
	const index = columnGrantIndex(report);
	return report.objects.filter((object) => {
		if (options.domain !== "" && object.domain !== options.domain) {
			return false;
		}
		if (!options.differencesOnly) {
			return true;
		}
		// On a mature database this toggle *is* the report.
		const indirect = object.cells.some(
			(entry) =>
				entry.privileges.length > 0 &&
				entry.path !== null &&
				!entry.sources.includes("direct"),
		);
		return (
			indirect ||
			columnRows(grantsFor(index, object)).some((row) =>
				columnRowDiffers(row, object, report.roles),
			)
		);
	});
}

function ColumnCell(props: {
	privileges: Privilege[] | undefined;
	blocked: boolean;
}) {
	if (props.privileges === undefined || props.privileges.length === 0) {
		return <td className="dg-access-none">–</td>;
	}
	const text = letters(props.privileges);
	return (
		<td
			className={props.blocked ? "dg-access-blocked" : undefined}
			title={
				props.blocked
					? `${text} — but no USAGE on the schema, so this is not access`
					: undefined
			}
		>
			{text}
		</td>
	);
}

export function AccessMatrix(props: {
	report: Pick<
		AccessReportResult,
		"roles" | "columnGrants" | "schemaUsage" | "objects"
	>;
	objects: AccessObject[];
	differencesOnly: boolean;
	/** `objectKey`s of the relations whose columns are showing. */
	expanded: ReadonlySet<string>;
	onToggle: (key: string) => void;
	onOpen: (object: AccessObject) => void;
}) {
	const columns = props.report.roles;
	const index = columnGrantIndex(props.report);
	const usage = new Map(
		props.report.schemaUsage.map((entry) => [entry.schema, entry.roles]),
	);
	const width = columns.length + 4;

	return (
		<table className="dg-domain-table dg-access-matrix">
			<thead>
				<tr>
					<th>object</th>
					<th>domain</th>
					{columns.map((role) => (
						<th key={role}>{role}</th>
					))}
					<th>RLS</th>
					<th>notes</th>
				</tr>
			</thead>
			<tbody>
				{props.objects.flatMap((object) => {
					const key = objectKey(object);
					const byRole = new Map(
						object.cells.map((entry) => [entry.role, entry]),
					);
					const all = columnRows(grantsFor(index, object));
					const open = all.length > 0 && props.expanded.has(key);
					const subRows = open
						? props.differencesOnly
							? all.filter((row) => columnRowDiffers(row, object, columns))
							: all
						: [];
					// No usage list for the schema means the read did not cover
					// it, not that nobody has USAGE: strike nothing rather than
					// everything.
					const schemaRoles = usage.get(object.schema);
					const blocked = (role: string) =>
						schemaRoles !== undefined && !schemaRoles.includes(role);

					const rows = [
						<tr key={key}>
							<td>
								<button
									type="button"
									className="dg-access-object"
									onClick={() => props.onOpen(object)}
								>
									{object.schema}.{object.name}
								</button>
							</td>
							<td>{object.domain ?? "—"}</td>
							{columns.map((role) => (
								<Cell key={role} entry={byRole.get(role)} />
							))}
							<td>
								{object.rls}
								{(object.rls === "on" || object.rls === "forced") &&
									object.policyCount === 0 && (
										<span
											className="dg-access-warn"
											title="RLS on with zero policies denies every row, silently"
										>
											{" "}
											0 policies
										</span>
									)}
							</td>
							<td className="dg-access-notes">
								{isRoutine(object) && object.securityDefiner && (
									<span title="Runs as its owner">definer</span>
								)}
								{isRoutine(object) &&
									object.securityDefiner &&
									!object.searchPathPinned && (
										<span title="No search_path pinned">no search_path</span>
									)}
								{object.kind === "view" && object.securityInvoker === false && (
									<span title="Reads its base relations as its owner">
										owner-reads
									</span>
								)}
								{all.length > 0 ? (
									<Button
										size="sm"
										className="dg-access-col"
										aria-expanded={open}
										aria-label={`${open ? "Hide" : "Show"} column grants on ${object.schema}.${object.name}`}
										title="Column-level grants exist; the cell rounds them off"
										onClick={() => props.onToggle(key)}
									>
										{open ? "▾" : "▸"} col {all.length}
									</Button>
								) : (
									object.hasColumnGrants && (
										// ACLs exist on some column but no shown role holds
										// anything on one: there is nothing to expand into.
										<span title="Column-level grants exist, none to a shown role">
											col
										</span>
									)
								)}
							</td>
						</tr>,
					];
					for (const row of subRows) {
						rows.push(
							<tr key={`${key}/${row.column}`} className="dg-access-colrow">
								<td>
									<span className="dg-access-colname">
										<span aria-hidden>↳ </span>
										{row.column}
									</span>
								</td>
								<td className="dg-access-collabel">column</td>
								{columns.map((role) => (
									<ColumnCell
										key={role}
										privileges={row.byRole.get(role)}
										blocked={blocked(role)}
									/>
								))}
								<td colSpan={2} />
							</tr>,
						);
					}
					if (open && subRows.length === 0) {
						rows.push(
							<tr key={`${key}/none`} className="dg-access-colrow">
								<td colSpan={width} className="dg-tree-note">
									every column grant here matches the table's
								</td>
							</tr>,
						);
					}
					return rows;
				})}
				{props.objects.length === 0 && (
					<tr>
						<td colSpan={width} className="dg-tree-note">
							{props.differencesOnly
								? "every privilege here was granted to its role by name"
								: "nothing to show"}
						</td>
					</tr>
				)}
			</tbody>
		</table>
	);
}
