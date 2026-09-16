import type {
	InputHTMLAttributes,
	ReactNode,
	Ref,
	SelectHTMLAttributes,
} from "react";

/**
 * The form controls, once.
 *
 * There were two kinds of text box in the same form: the connection
 * string's, and the one under "Name" a centimetre below it. Nobody
 * decided that — a control gets written where it is needed, and a
 * second one gets written the same way a month later with a different
 * padding. The cost is not the mismatch, it is that every improvement
 * after this has to be made in nine places and will be made in one.
 *
 * So: `TextInput` and `Select` carry the shape, `.dg-input`/`.dg-select`
 * carry the paint, and `Field` puts a label on either. A control that
 * needs to look different asks for a modifier class rather than
 * inventing itself — the filter boxes in the tree and the breadcrumb are
 * the two that legitimately do.
 *
 * Buttons, toggles and the segmented control are still written by hand
 * in a dozen places; that is on the roadmap (`ui · one-of-each-control`)
 * rather than pretended away here.
 */

function classes(base: string, extra: string | undefined): string {
	return extra === undefined || extra === "" ? base : `${base} ${extra}`;
}

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
	ref?: Ref<HTMLInputElement>;
};

export function TextInput({ className, ...rest }: TextInputProps) {
	return <input className={classes("dg-input", className)} {...rest} />;
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
	ref?: Ref<HTMLSelectElement>;
};

export function Select({ className, children, ...rest }: SelectProps) {
	return (
		<select className={classes("dg-select", className)} {...rest}>
			{children}
		</select>
	);
}

/**
 * A label above a control, which is the shape every form here uses. The
 * label is a real `<label>`, so the text is part of the control's hit
 * area and a screen reader names it without an `aria-label` per field.
 */
export function Field(props: {
	label: ReactNode;
	className?: string;
	hint?: ReactNode;
	children: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: the control is the child this exists to label; which one is the caller's business
		<label className={classes("dg-field", props.className)}>
			<span>{props.label}</span>
			{props.children}
			{props.hint !== undefined && <p className="dg-form-hint">{props.hint}</p>}
		</label>
	);
}
