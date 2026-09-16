/**
 * What a selection of cells adds up to (docs/spec/table-view.md
 * "Selecting cells").
 *
 * The question people open a spreadsheet to answer — sum, average, how
 * many, how many of them are null — asked of the grid they are already
 * looking at, so the answer does not need a second query or a second
 * application.
 *
 * Deliberately not a query. These are the cells on screen, and the bar
 * says so: `sum` over a page of 200 rows is the sum of that page. A
 * number that silently meant something else than what is highlighted
 * would be worse than no number.
 */

export interface SelectionStats {
	/** Cells in the selection, nulls included. */
	cells: number;
	nulls: number;
	/** Cells that are a number, or a string that is exactly a number. */
	numbers: number;
	/** Distinct non-null values, by their text. */
	distinct: number;
	sum: number | null;
	average: number | null;
	min: number | null;
	max: number | null;
}

/**
 * A string that is exactly a number and nothing else.
 *
 * It matters because `numeric` and `bigint` arrive as strings from
 * every driver here — a sum over a money column would otherwise be the
 * one thing this bar cannot do. Values past `Number.MAX_SAFE_INTEGER`
 * lose precision in the total; that is the cost of a footer stat and
 * not a reason to refuse the other 99%.
 */
const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function asNumber(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value === "bigint") {
		return Number(value);
	}
	if (typeof value === "string" && NUMERIC.test(value.trim())) {
		const parsed = Number(value.trim());
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

export function summarize(values: readonly unknown[]): SelectionStats {
	const seen = new Set<string>();
	let nulls = 0;
	let numbers = 0;
	let sum = 0;
	let min: number | null = null;
	let max: number | null = null;

	for (const value of values) {
		if (value === null || value === undefined) {
			nulls++;
			continue;
		}
		seen.add(typeof value === "object" ? JSON.stringify(value) : String(value));
		const numeric = asNumber(value);
		if (numeric === null) {
			continue;
		}
		numbers++;
		sum += numeric;
		min = min === null || numeric < min ? numeric : min;
		max = max === null || numeric > max ? numeric : max;
	}

	return {
		cells: values.length,
		nulls,
		numbers,
		distinct: seen.size,
		sum: numbers > 0 ? sum : null,
		average: numbers > 0 ? sum / numbers : null,
		min,
		max,
	};
}

/** Enough digits to be useful, few enough to read at a glance. */
function number(value: number): string {
	if (Number.isInteger(value) && Math.abs(value) < 1e15) {
		return value.toLocaleString();
	}
	return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/**
 * The bar's text, as pairs. Aggregates only appear when there is
 * something to aggregate: a selection of names gets a count and how
 * many distinct ones there are, which is the useful question about
 * names, and no `sum 0` pretending otherwise.
 */
export function statLine(
	stats: SelectionStats,
): Array<{ label: string; value: string }> {
	const parts: Array<{ label: string; value: string }> = [
		{ label: "cells", value: number(stats.cells) },
	];
	if (stats.nulls > 0) {
		parts.push({ label: "null", value: number(stats.nulls) });
	}
	if (stats.numbers > 0 && stats.sum !== null && stats.average !== null) {
		parts.push({ label: "sum", value: number(stats.sum) });
		parts.push({ label: "avg", value: number(stats.average) });
		if (stats.min !== null) {
			parts.push({ label: "min", value: number(stats.min) });
		}
		if (stats.max !== null) {
			parts.push({ label: "max", value: number(stats.max) });
		}
	} else {
		parts.push({ label: "distinct", value: number(stats.distinct) });
	}
	return parts;
}
