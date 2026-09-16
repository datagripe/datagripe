import type {
	ButtonHTMLAttributes,
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
 * `Button` is the same bargain for the thing you press. Every action
 * in the sidebar goes through it, so `commit…`, `push`, `create` and
 * `copy client config` are one control with one hover and one disabled
 * state rather than four buttons that were each written where they were
 * needed. Toggles and the segmented control are still written by hand;
 * that is on the roadmap (`ui · one-of-each-control`) rather than
 * pretended away here.
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

/**
 * A pressable thing.
 *
 * `tone` is what it means, not what colour it is: `primary` is the one
 * press a panel is about, `danger` is the one that takes something
 * away. `size="sm"` is the sidebar's, where a button sits in a column
 * 260 pixels wide and shares a line with two others.
 *
 * `type` defaults to `button`, because a button inside a form that
 * nobody gave a type to submits the form, and that has never once been
 * what anybody wanted.
 */
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	tone?: "default" | "primary" | "danger";
	size?: "sm" | "md";
	ref?: Ref<HTMLButtonElement>;
};

const BUTTON_TONE = {
	default: "",
	primary: " dg-btn-pri",
	danger: " dg-btn-dan",
} as const;

export function Button({
	className,
	tone = "default",
	size = "md",
	type = "button",
	...rest
}: ButtonProps) {
	return (
		<button
			type={type}
			className={classes(
				`dg-btn${BUTTON_TONE[tone]}${size === "sm" ? " dg-btn-sm" : ""}`,
				className,
			)}
			{...rest}
		/>
	);
}
