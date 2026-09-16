import { describe, expect, test } from "bun:test";
import { statLine, summarize } from "./gridStats";

/**
 * The aggregate bar (docs/spec/table-view.md "Selecting cells").
 *
 * The rule these tests exist for: **a number that is not on screen is
 * never in the total.** The bar aggregates the selected cells and
 * nothing else — no second query, no whole-table sum behind a page of
 * 200 rows.
 */

describe("summarize", () => {
	test("counts cells and nulls separately", () => {
		const stats = summarize([1, null, 3, undefined]);
		expect(stats.cells).toBe(4);
		expect(stats.nulls).toBe(2);
		expect(stats.numbers).toBe(2);
		expect(stats.sum).toBe(4);
		expect(stats.average).toBe(2);
	});

	// `numeric` and `bigint` arrive as strings from every driver here, so
	// a sum over a money column is the main case, not an edge one.
	test("a string that is exactly a number counts as one", () => {
		const stats = summarize(["10.50", "4.50", " 5 "]);
		expect(stats.numbers).toBe(3);
		expect(stats.sum).toBe(20);
	});

	test("a string that merely contains a number does not", () => {
		const stats = summarize(["10 apples", "£4.50", "2026-09-16", "1e", ""]);
		expect(stats.numbers).toBe(0);
		expect(stats.sum).toBeNull();
		expect(stats.average).toBeNull();
	});

	test("min and max ignore the nulls", () => {
		const stats = summarize([5, null, -2, 9]);
		expect(stats.min).toBe(-2);
		expect(stats.max).toBe(9);
	});

	test("distinct is by value, nulls excluded", () => {
		const stats = summarize(["a", "a", "b", null]);
		expect(stats.distinct).toBe(2);
	});

	test("a selection of nothing but nulls has no total", () => {
		const stats = summarize([null, null]);
		expect(stats).toMatchObject({
			cells: 2,
			nulls: 2,
			numbers: 0,
			sum: null,
			average: null,
			min: null,
			max: null,
		});
	});
});

describe("statLine", () => {
	test("numbers get the arithmetic", () => {
		const parts = statLine(summarize([1, 2, 3]));
		expect(parts.map((part) => part.label)).toEqual([
			"cells",
			"sum",
			"avg",
			"min",
			"max",
		]);
		expect(parts.find((part) => part.label === "sum")?.value).toBe("6");
	});

	// `sum 0` over a column of names is a number that means nothing;
	// how many different names there are is the question people have.
	test("text gets a distinct count instead of a sum", () => {
		const parts = statLine(summarize(["alice", "bob", "alice"]));
		expect(parts.map((part) => part.label)).toEqual(["cells", "distinct"]);
	});

	test("nulls are named when there are any, and silent when there are not", () => {
		expect(statLine(summarize([1, null])).map((part) => part.label)).toContain(
			"null",
		);
		expect(statLine(summarize([1, 2])).map((part) => part.label)).not.toContain(
			"null",
		);
	});
});
