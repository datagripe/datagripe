import { Button } from "./controls";
import { statLine, summarize } from "./gridStats";

/**
 * What the selected cells add up to, along the bottom of a grid
 * (docs/spec/table-view.md "Selecting cells").
 *
 * The same bar under both grids, because "how much is that" is the same
 * question whether the rows came from a query or from browsing a table.
 *
 * It says `cells` first and on purpose: every number beside it is about
 * the cells that are highlighted and nothing else. A `sum` that quietly
 * meant the whole table behind a page of 200 rows would be a lie told
 * in small type.
 */
export function SelectionBar(props: {
	values: readonly unknown[];
	onCopy: () => void;
}) {
	const parts = statLine(summarize(props.values));

	return (
		<div className="dg-selbar">
			{parts.map((part) => (
				<span key={part.label} className="dg-selbar-stat">
					<span className="dg-selbar-label">{part.label}</span>
					<span className="dg-selbar-value">{part.value}</span>
				</span>
			))}
			<span className="dg-modal-actions-spacer" />
			<Button
				size="sm"
				onClick={props.onCopy}
				title="Copy the selection (Ctrl+C)"
			>
				copy
			</Button>
		</div>
	);
}
