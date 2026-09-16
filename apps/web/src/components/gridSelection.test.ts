import { describe, expect, test } from "bun:test";
import {
	type CellRange,
	rangeBounds,
	rangeCells,
	rangeIncludes,
	rangeSize,
	rangeToTsv,
	rangeValues,
} from "./gridSelection";

/**
 * Cell-range geometry (docs/spec/table-view.md "Selecting cells").
 *
 * The case worth pinning: a selection dragged **up and to the left** is
 * the same rectangle as one dragged down and to the right. Every
 * consumer — the highlight, the copy, the aggregate bar — reads it
 * through these, so getting it wrong in one place is impossible rather
 * than likely.
 */

const range = (
	anchorRow: number,
	anchorColumn: number,
	headRow: number,
	headColumn: number,
): CellRange => ({
	anchor: { row: anchorRow, column: anchorColumn },
	head: { row: headRow, column: headColumn },
});

describe("rangeBounds", () => {
	test("a backwards drag is the same rectangle", () => {
		expect(rangeBounds(range(3, 4, 1, 2))).toEqual(
			rangeBounds(range(1, 2, 3, 4)),
		);
		expect(rangeBounds(range(3, 4, 1, 2))).toEqual({
			top: 1,
			left: 2,
			bottom: 3,
			right: 4,
		});
	});
});

describe("rangeIncludes", () => {
	test("covers the rectangle and nothing outside it", () => {
		const selection = range(1, 1, 2, 3);
		expect(rangeIncludes(selection, 1, 1)).toBe(true);
		expect(rangeIncludes(selection, 2, 3)).toBe(true);
		expect(rangeIncludes(selection, 1, 4)).toBe(false);
		expect(rangeIncludes(selection, 3, 2)).toBe(false);
		expect(rangeIncludes(null, 0, 0)).toBe(false);
	});
});

describe("rangeSize", () => {
	test("a single cell is one, not none", () => {
		expect(rangeSize(range(2, 2, 2, 2))).toBe(1);
		expect(rangeSize(range(0, 0, 1, 2))).toBe(6);
		expect(rangeSize(null)).toBe(0);
	});
});

describe("rangeCells", () => {
	test("reads row by row, left to right, whichever way it was dragged", () => {
		expect(rangeCells(range(1, 1, 0, 0))).toEqual([
			{ row: 0, column: 0 },
			{ row: 0, column: 1 },
			{ row: 1, column: 0 },
			{ row: 1, column: 1 },
		]);
	});
});

describe("rangeValues", () => {
	test("pulls the cells in reading order", () => {
		const grid = [
			["a", "b"],
			["c", "d"],
		];
		expect(
			rangeValues(range(0, 0, 1, 1), (row, column) => grid[row]?.[column]),
		).toEqual(["a", "b", "c", "d"]);
	});
});

describe("rangeToTsv", () => {
	test("rows are lines and columns are tabs", () => {
		const grid = [
			["1", "one"],
			["2", "two"],
		];
		expect(
			rangeToTsv(range(0, 0, 1, 1), (row, column) => grid[row]?.[column] ?? ""),
		).toBe("1\tone\n2\ttwo");
	});

	// A tab inside a value would forge a column that is not there, and
	// the paste would land one cell to the right for the rest of the row.
	test("a tab or a newline in a value cannot forge a cell", () => {
		expect(rangeToTsv(range(0, 0, 0, 0), () => "a\tb\nc")).toBe("a\\tb\\nc");
	});
});
