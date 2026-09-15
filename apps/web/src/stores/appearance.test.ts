import { describe, expect, test } from "bun:test";
import {
	clampScale,
	editorFontSize,
	SCALE_DEFAULT,
	SCALE_MAX,
	SCALE_MIN,
} from "./appearance";

describe("interface scale", () => {
	test("stays inside the slider's range", () => {
		expect(clampScale(0.1)).toBe(SCALE_MIN);
		expect(clampScale(12)).toBe(SCALE_MAX);
	});

	test("lands on a step, whatever arrives", () => {
		expect(clampScale(1.23)).toBe(1.25);
		expect(clampScale(1.01)).toBe(1);
	});

	// Both ends of this are text: an attribute on an <input type=range>
	// and a string in localStorage. A corrupt one must not blank the app.
	test("nonsense is the default rather than a page at scale NaN", () => {
		expect(clampScale(Number.NaN)).toBe(SCALE_DEFAULT);
		expect(clampScale(Number.POSITIVE_INFINITY)).toBe(SCALE_DEFAULT);
	});

	test("Monaco gets a number of pixels, not a multiplier", () => {
		expect(editorFontSize(13, 1)).toBe(13);
		expect(editorFontSize(13, 1.5)).toBe(19.5);
	});
});
