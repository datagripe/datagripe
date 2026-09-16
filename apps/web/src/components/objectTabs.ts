import type { Finding, GripeSeverity, ObjectTab } from "@datagripe/contracts";

/**
 * The object view's tab-strip arithmetic.
 *
 * Its own module so a test can reach it: the panel imports Monaco now
 * (the definition tab is an editor), and a unit test for "which mark
 * does this tab wear" should not be loading an editor and its workers
 * to find out.
 */

/** Matches the glyphs the gripe rows use, so the strip reads the same. */
const SEVERITY_ORDER: GripeSeverity[] = ["blocker", "warning", "style"];

/**
 * The worst severity among a tab's findings, or null when it has none.
 * A finding with no tab belongs to every tab, so it marks all of them.
 */
export function worstSeverityForTab(
	findings: Finding[],
	tab: ObjectTab,
): GripeSeverity | null {
	const present = new Set(
		findings
			.filter(
				(finding) =>
					finding.at.kind === "object" &&
					(finding.at.tab === undefined || finding.at.tab === tab),
			)
			.map((finding) => finding.severity),
	);
	return SEVERITY_ORDER.find((severity) => present.has(severity)) ?? null;
}
