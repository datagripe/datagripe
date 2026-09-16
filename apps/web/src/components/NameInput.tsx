import { useRef } from "react";

/**
 * Naming a file, in the row the file occupies.
 *
 * Enter takes it, Escape abandons it, and clicking away takes it too —
 * the three answers a text box in a tree has to have. The extension is
 * left out of the initial selection, so typing replaces the name and
 * keeps the `.sql` (or whatever it is) that decides the language
 * (docs/spec/markdown-documents.md "Where a language comes from").
 *
 * It does not enforce uniqueness: the store suggests `-1`, `-2`, … for
 * a name that is taken, because typing a name somebody else used is far
 * more often "another one of these" than a mistake.
 */
export function NameInput(props: {
	initial: string;
	"aria-label": string;
	onCommit: (name: string) => void;
	onCancel: () => void;
}) {
	// Committing on blur and committing on Enter must not both fire.
	const settled = useRef(false);

	const commit = (value: string) => {
		if (settled.current) {
			return;
		}
		settled.current = true;
		const name = value.trim();
		if (name === "") {
			props.onCancel();
			return;
		}
		props.onCommit(name);
	};

	const cancel = () => {
		if (settled.current) {
			return;
		}
		settled.current = true;
		props.onCancel();
	};

	return (
		<input
			className="dg-input dg-name-input"
			defaultValue={props.initial}
			aria-label={props["aria-label"]}
			spellCheck={false}
			maxLength={255}
			ref={(input) => {
				if (input === null) {
					return;
				}
				input.focus();
				const dot = input.value.lastIndexOf(".");
				input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					commit(event.currentTarget.value);
				} else if (event.key === "Escape") {
					event.preventDefault();
					cancel();
				}
			}}
			onBlur={(event) => commit(event.currentTarget.value)}
		/>
	);
}
