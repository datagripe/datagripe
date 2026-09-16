import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A selection of cells, in both grids (docs/spec/table-view.md
 * "Selecting cells").
 *
 * One shape, not two: the results grid is read-only and the table view
 * is editable, but "which cells am I looking at" is the same question
 * in both, and a selection that behaved differently between the panel
 * you query in and the panel you browse in would be two things to
 * learn. The geometry is pure so it can be tested without a DOM.
 *
 * Rectangles stay compact; Ctrl/Cmd-click materializes an explicit set.
 * Every consumer reads the same cells in row/column order so highlights,
 * statistics and clipboard contents agree even for disjoint selections.
 */

export interface CellRef {
	row: number;
	column: number;
}

/** The first cell pressed, and the last one reached. */
export interface CellRange {
	anchor: CellRef;
	head: CellRef;
	/** Present for a disjoint selection; absent for a rectangle. */
	cells?: CellRef[];
}

export interface RangeBounds {
	top: number;
	left: number;
	bottom: number;
	right: number;
}

export function rangeBounds(range: CellRange): RangeBounds {
	return {
		top: Math.min(range.anchor.row, range.head.row),
		bottom: Math.max(range.anchor.row, range.head.row),
		left: Math.min(range.anchor.column, range.head.column),
		right: Math.max(range.anchor.column, range.head.column),
	};
}

export function rangeIncludes(
	range: CellRange | null,
	row: number,
	column: number,
): boolean {
	if (range === null) {
		return false;
	}
	if (range.cells !== undefined) {
		return range.cells.some(
			(cell) => cell.row === row && cell.column === column,
		);
	}
	const bounds = rangeBounds(range);
	return (
		row >= bounds.top &&
		row <= bounds.bottom &&
		column >= bounds.left &&
		column <= bounds.right
	);
}

/** How many selected cells it covers. */
export function rangeSize(range: CellRange | null): number {
	if (range === null) {
		return 0;
	}
	if (range.cells !== undefined) return range.cells.length;
	const bounds = rangeBounds(range);
	return (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1);
}

/** Every selected cell, row by row, left to right. */
export function rangeCells(range: CellRange): CellRef[] {
	if (range.cells !== undefined)
		return [...range.cells].sort(
			(a, b) => a.row - b.row || a.column - b.column,
		);
	const bounds = rangeBounds(range);
	const cells: CellRef[] = [];
	for (let row = bounds.top; row <= bounds.bottom; row++) {
		for (let column = bounds.left; column <= bounds.right; column++) {
			cells.push({ row, column });
		}
	}
	return cells;
}

/** Every selected value, in the same order. */
export function rangeValues<T>(
	range: CellRange,
	valueAt: (row: number, column: number) => T,
): T[] {
	return rangeCells(range).map((cell) => valueAt(cell.row, cell.column));
}

/**
 * The selection as tab-separated rows, which is what a spreadsheet
 * reads and what every other grid puts on the clipboard.
 *
 * A tab or a newline inside a value would forge columns that are not
 * there, so both are escaped to their literal two characters rather
 * than quoted: this is a paste target, not a CSV file, and half the
 * world's spreadsheets disagree about quoting.
 */
export function rangeToTsv(
	range: CellRange,
	textAt: (row: number, column: number) => string,
): string {
	// Copy only selected values, packing each selected row in column order.
	const lines: string[] = [];
	let previousRow = -1;
	let cells: string[] = [];
	for (const cell of rangeCells(range)) {
		if (cell.row !== previousRow && cells.length > 0) {
			lines.push(cells.join("\t"));
			cells = [];
		}
		cells.push(
			textAt(cell.row, cell.column)
				.replaceAll("\t", "\\t")
				.replaceAll("\n", "\\n"),
		);
		previousRow = cell.row;
	}
	if (cells.length > 0) lines.push(cells.join("\t"));
	return lines.join("\n");
}

/** Shift preserves the original anchor; a plain click starts afresh. */
export function beginSelection(
	current: CellRange | null,
	row: number,
	column: number,
	shiftKey: boolean,
	additive = false,
): CellRange | null {
	const cell = { row, column };
	if (shiftKey && current !== null)
		return { anchor: current.anchor, head: cell };
	if (additive && current !== null) {
		const cells = rangeIncludes(current, row, column)
			? rangeCells(current).filter(
					(entry) => entry.row !== row || entry.column !== column,
				)
			: [...rangeCells(current), cell];
		return cells.length === 0
			? null
			: { anchor: current.anchor, head: cell, cells };
	}
	return { anchor: cell, head: cell };
}

export interface CellSelection {
	range: CellRange | null;
	/** Cells covered; 0 when nothing is selected. */
	size: number;
	isSelected: (row: number, column: number) => boolean;
	/**
	 * A press on a cell. Shift keeps the anchor and moves the far corner,
	 * which is the gesture every grid and every file list already has.
	 */
	begin: (
		row: number,
		column: number,
		shiftKey: boolean,
		additive?: boolean,
	) => void;
	/**
	 * The pointer over a cell with the button still down. Wired to
	 * `mouseover` rather than `mouseenter`: a cell contains a control in
	 * the editable grid, and `mouseover` fires for the cell's whole
	 * subtree, so a drag that crosses the button rather than the padding
	 * still extends. Repeats are free.
	 */
	extendTo: (row: number, column: number) => void;
	/** One cell, without starting a drag: focus landing on a cell. */
	select: (row: number, column: number) => void;
	/** Programmatic extension: the keyboard's shift+arrow. */
	moveHead: (
		rowDelta: number,
		columnDelta: number,
		bounds: RangeBounds,
	) => void;
	clear: () => void;
}

/**
 * Selection state plus the drag, which is the only stateful part: a
 * press starts one, and the release is on `window` because the pointer
 * routinely leaves the grid before the button comes up.
 */
export function useCellSelection(): CellSelection {
	const [range, setRange] = useState<CellRange | null>(null);
	const dragging = useRef(false);

	useEffect(() => {
		const stop = () => {
			dragging.current = false;
		};
		window.addEventListener("mouseup", stop);
		return () => window.removeEventListener("mouseup", stop);
	}, []);

	const begin = useCallback(
		(row: number, column: number, shiftKey: boolean, additive = false) => {
			dragging.current = !additive || shiftKey;
			setRange((current) =>
				beginSelection(current, row, column, shiftKey, additive),
			);
		},
		[],
	);

	const extendTo = useCallback((row: number, column: number) => {
		if (!dragging.current) {
			return;
		}
		setRange((current) => {
			// The pointer crosses a cell many times over — between the cell
			// and the control inside it, and once per pixel of a slow drag.
			// Returning the same object is what keeps that free.
			if (
				current === null ||
				(current.head.row === row && current.head.column === column)
			) {
				return current;
			}
			return { anchor: current.anchor, head: { row, column } };
		});
	}, []);

	const select = useCallback((row: number, column: number) => {
		setRange({ anchor: { row, column }, head: { row, column } });
	}, []);

	const moveHead = useCallback(
		(rowDelta: number, columnDelta: number, limits: RangeBounds) => {
			setRange((current) =>
				current === null
					? current
					: {
							anchor: current.anchor,
							head: {
								row: clamp(
									current.head.row + rowDelta,
									limits.top,
									limits.bottom,
								),
								column: clamp(
									current.head.column + columnDelta,
									limits.left,
									limits.right,
								),
							},
						},
			);
		},
		[],
	);

	const clear = useCallback(() => setRange(null), []);

	return {
		range,
		size: rangeSize(range),
		isSelected: (row, column) => rangeIncludes(range, row, column),
		begin,
		extendTo,
		select,
		moveHead,
		clear,
	};
}

function clamp(value: number, low: number, high: number): number {
	return Math.min(Math.max(value, low), high);
}
