import { create } from "zustand";

/**
 * How big the interface is (docs/spec/editor-workspace.md "Scale").
 *
 * One number, `--dg-scale`, multiplying every type token in
 * styles/tokens.css. Nothing else in the application is allowed to know
 * about it: a component that reads the scale to size itself is a
 * component that stops scaling the day somebody changes the slider
 * range. Monaco is the one exception, because its font size is a
 * JavaScript option rather than CSS.
 *
 * Local to the browser, not the account. The reason to turn it up is
 * usually the screen in front of you — a laptop on a desk and the same
 * project on a phone want different answers, and a server-side setting
 * would give them the same one.
 */

export const SCALE_KEY = "dg.appearance.scale";
export const SCALE_MIN = 0.8;
export const SCALE_MAX = 1.8;
export const SCALE_STEP = 0.05;
export const SCALE_DEFAULT = 1;

/** In range and on a step, because both ends of this arrive as text. */
export function clampScale(value: number): number {
	if (!Number.isFinite(value)) {
		return SCALE_DEFAULT;
	}
	const stepped = Math.round(value / SCALE_STEP) * SCALE_STEP;
	return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Number(stepped.toFixed(2))));
}

export function readScale(): number {
	try {
		const raw = localStorage.getItem(SCALE_KEY);
		return raw === null ? SCALE_DEFAULT : clampScale(Number.parseFloat(raw));
	} catch {
		return SCALE_DEFAULT;
	}
}

/**
 * Put it on `<html>`, where an inline style beats the token file's own
 * `--dg-scale: 1`. Called once before the first render (main.tsx) so
 * the application never paints at one size and then jumps to another.
 */
export function applyScale(scale: number): void {
	document.documentElement.style.setProperty("--dg-scale", String(scale));
}

export interface AppearanceState {
	scale: number;
	setScale: (scale: number) => void;
}

export const useAppearanceStore = create<AppearanceState>()((set) => ({
	scale: readScale(),
	setScale(scale) {
		const next = clampScale(scale);
		applyScale(next);
		try {
			localStorage.setItem(SCALE_KEY, String(next));
		} catch {
			// Storage blocked — the size holds for this session and no longer.
		}
		set({ scale: next });
	},
}));

/** Monaco takes a number of pixels, so it has to do the sum itself. */
export function editorFontSize(base: number, scale: number): number {
	return Math.round(base * scale * 10) / 10;
}

/**
 * Keep a live Monaco instance on the reader's scale. Returns the
 * unsubscribe, to go in the same cleanup that disposes the editor —
 * re-creating the editor instead would throw away undo history and the
 * cursor for a change to a font size.
 */
export function trackEditorScale(
	editor: { updateOptions: (options: { fontSize: number }) => void },
	base: number,
): () => void {
	return useAppearanceStore.subscribe((state, previous) => {
		if (state.scale !== previous.scale) {
			editor.updateOptions({ fontSize: editorFontSize(base, state.scale) });
		}
	});
}
