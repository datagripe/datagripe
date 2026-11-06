import { describe, expect, test } from "bun:test";
import type {
	AccessCell,
	AccessObject,
	AccessReportResult,
} from "@datagripe/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { AccessMatrix, objectKey, visibleObjects } from "./AccessMatrix";

/**
 * The column-grant expansion (docs/spec/access-report.md "Column
 * grants"). The case the matrix used to round off:
 * `GRANT SELECT (a) ON s.t TO r` — `r` reads nothing on the table and
 * `a` on the column, and the table cell alone says `–`.
 */

function cell(role: string, privileges: AccessCell["privileges"]): AccessCell {
	return {
		role,
		privileges,
		sources: privileges.length === 0 ? [] : ["direct"],
		path: null,
		schemaBlocked: false,
	};
}

function relation(
	name: string,
	cells: AccessCell[],
	hasColumnGrants: boolean,
): AccessObject {
	return {
		schema: "s",
		name,
		kind: "table",
		owner: "owner",
		cells,
		rls: "off",
		policyCount: 0,
		securityInvoker: null,
		securityDefiner: null,
		searchPathPinned: null,
		hasColumnGrants,
		domain: null,
	};
}

const t = relation("t", [cell("r", []), cell("w", ["select"])], true);
const plain = relation("plain", [cell("r", ["select"]), cell("w", [])], false);

const report: Pick<
	AccessReportResult,
	"roles" | "columnGrants" | "schemaUsage" | "objects"
> = {
	roles: ["r", "w"],
	objects: [t, plain],
	schemaUsage: [{ schema: "s", roles: ["r", "w"] }],
	columnGrants: [
		{
			schema: "s",
			name: "t",
			grants: [
				{ column: "a", role: "r", privileges: ["select"] },
				// `w` reads the whole table, so `has_column_privilege` says yes
				// on `a` too: the same as its table cell, not a difference.
				{ column: "a", role: "w", privileges: ["select"] },
				{ column: "b", role: "w", privileges: ["select"] },
			],
		},
	],
};

function render(options: {
	expanded?: string[];
	differencesOnly?: boolean;
	objects?: AccessObject[];
}): string {
	return renderToStaticMarkup(
		<AccessMatrix
			report={report}
			objects={options.objects ?? report.objects}
			differencesOnly={options.differencesOnly ?? false}
			expanded={new Set(options.expanded ?? [])}
			onToggle={() => {}}
			onOpen={() => {}}
		/>,
	);
}

/** The text of each `<tr>` in the body, cells joined by `|`. */
function bodyRows(html: string): string[] {
	const body = html.slice(html.indexOf("<tbody>"));
	return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((match) =>
		[...(match[1] ?? "").matchAll(/<td[^>]*>(.*?)<\/td>/g)]
			.map((td) => (td[1] ?? "").replace(/<[^>]+>/g, "").trim())
			.join("|"),
	);
}

describe("AccessMatrix column grants", () => {
	test("collapsed: an expander on the relation with grants, none elsewhere", () => {
		const html = render({});
		const expanders = html.match(/aria-expanded/g) ?? [];
		expect(expanders).toHaveLength(1);
		expect(html).toContain('aria-label="Show column grants on s.t"');
		expect(html).not.toContain("column grants on s.plain");
		expect(bodyRows(html)).toHaveLength(2);
	});

	test("expanded: column a shows r with SELECT, in the cell's letters", () => {
		const rows = bodyRows(render({ expanded: [objectKey(t)] }));
		// t's own row: r has nothing on the table, w reads it.
		expect(rows[0]).toStartWith("s.t|—|–|R|");
		expect(rows[1]).toBe("↳ a|column|R|R|");
		expect(rows[2]).toBe("↳ b|column|–|R|");
		expect(rows[3]).toStartWith("s.plain|");
		expect(rows).toHaveLength(4);
	});

	test("differences only keeps the column the table cell rounds off", () => {
		const rows = bodyRows(
			render({
				expanded: [objectKey(t)],
				differencesOnly: true,
				objects: visibleObjects(report, { differencesOnly: true, domain: "" }),
			}),
		);
		// `a` differs (r: – on the table, R on a); `b` repeats w's table
		// grant and goes, like a row with nothing indirect in it.
		expect(rows).toEqual([expect.stringMatching(/^s\.t\|/), "↳ a|column|R|R|"]);
	});

	test("differences only keeps a relation for its column grants alone", () => {
		const shown = visibleObjects(report, {
			differencesOnly: true,
			domain: "",
		});
		// Every table grant here is direct, so without the column clause
		// the toggle would hide the one finding the `col` note is about.
		expect(shown.map((object) => object.name)).toEqual(["t"]);
	});

	test("struck when the role has no USAGE on the schema", () => {
		const html = renderToStaticMarkup(
			<AccessMatrix
				report={{
					...report,
					schemaUsage: [{ schema: "s", roles: ["w"] }],
				}}
				objects={[t]}
				differencesOnly={false}
				expanded={new Set([objectKey(t)])}
				onToggle={() => {}}
				onOpen={() => {}}
			/>,
		);
		expect(html).toContain('class="dg-access-blocked"');
	});
});
