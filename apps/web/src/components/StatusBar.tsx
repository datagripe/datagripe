import { openGripesPanel } from "../app/viewPanels";
import { allFindings, findingCount, useGripesStore } from "../stores/gripes";
import { VersionStatus } from "./VersionStatus";

/**
 * Status bar.
 *
 * The left end used to name the active datasource, its namespace and
 * the project with its class accent — all of which the sidebar's
 * breadcrumb and the prompt already say, a foot up the same screen. A
 * status bar that repeats the chrome is a status bar nobody reads, so
 * what is left here is the two things said nowhere else: which version
 * this is (docs/spec/updates.md "The status bar") and how many gripes
 * are outstanding.
 */
export function StatusBar() {
	// A count, not a list: the panel is where findings are read. Blockers
	// colour the button so the one that matters is not averaged away.
	const gripes = useGripesStore((state) => findingCount(state));
	const blockers = useGripesStore(
		(state) =>
			allFindings(state).filter((finding) => finding.severity === "blocker")
				.length,
	);

	return (
		<footer className="dg-statusbar">
			<VersionStatus />
			<span className="dg-statusbar-spacer" />
			<button
				type="button"
				className={
					blockers > 0
						? "dg-statusbar-button dg-statusbar-blockers"
						: "dg-statusbar-button"
				}
				title="Open the gripes panel"
				onClick={() => openGripesPanel()}
			>
				{gripes === 0
					? "no gripes"
					: `${gripes} gripe${gripes === 1 ? "" : "s"}`}
			</button>
		</footer>
	);
}
