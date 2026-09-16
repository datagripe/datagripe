import type { DeploymentShape } from "@datagripe/contracts";
import { useEffect, useRef, useState } from "react";
import { UI_VERSION, useAppStore } from "../stores/app";
import { usePwaStore } from "../stores/pwa";
import { useCan } from "../stores/session";

/**
 * The version, bottom left (docs/spec/updates.md "The status bar").
 *
 * One item, and usually one number: `● 0.0.8`. The two versions are
 * only worth separating when they disagree, and everything that could
 * put a deployment behind — a newer release, a server the page has
 * fallen behind, a downloaded build waiting to be applied — collapses
 * into the same two words, because the reader's next action is the same
 * in all three: open this and find out what to press.
 *
 * It replaced the datasource and project readout that used to sit here.
 * Both are in the sidebar, a foot further up the same screen, and a
 * status bar repeating what the chrome already says is a status bar
 * nobody reads.
 */

/** What applying an update looks like, per shape. */
export function upgradeAdvice(
	shape: DeploymentShape,
	supervised: boolean,
): string {
	if (supervised) {
		return "This deployment pulls its image when the process starts, so restarting is the whole upgrade.";
	}
	switch (shape) {
		case "desktop":
			return "The desktop app updates itself — it offers the new version, and installs it when you accept.";
		case "cli":
			return "Stop it and run it again with @latest.";
		case "container":
			return "Pull the image and restart the container.";
		case "kubernetes":
			return "Roll the Deployment — its image tag decides what comes back.";
		default:
			return "Pull the repository and restart.";
	}
}

export function VersionStatus() {
	const [open, setOpen] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	const version = useAppStore((state) => state.version);
	const update = useAppStore((state) => state.update);
	const checking = useAppStore((state) => state.checking);
	const restarting = useAppStore((state) => state.restarting);
	const error = useAppStore((state) => state.error);
	const canRestart = useCan("server.restart");
	// A service worker holding a new build is the third way to be behind.
	const bundleWaiting = usePwaStore((state) => state.updateAvailable);

	const serverVersion = version?.server ?? null;
	const mismatch = serverVersion !== null && serverVersion !== UI_VERSION;
	const behind = update?.newer === true || mismatch || bundleWaiting;

	/**
	 * A server on a different version is proof that a new bundle exists,
	 * so ask for it now rather than on the hourly timer. Without this the
	 * page keeps saying "refresh to catch up" at somebody who is
	 * refreshing: the service worker answers every reload from the
	 * precache it already has.
	 */
	useEffect(() => {
		if (mismatch && !bundleWaiting) {
			void usePwaStore.getState().checkForNewBuild?.();
		}
	}, [mismatch, bundleWaiting]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const onPointerDown = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false);
			}
		};
		window.addEventListener("mousedown", onPointerDown);
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("mousedown", onPointerDown);
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	const restart = () => {
		if (
			window.confirm(
				"Restart DataGripe? Everyone in this deployment is disconnected for a few seconds, and unsaved work in an editor is kept in the browser. It comes back on whatever image it pulls.",
			)
		) {
			void useAppStore.getState().restart();
		}
	};

	return (
		<div className="dg-version" ref={rootRef}>
			<button
				type="button"
				className={`dg-statusbar-button dg-version-button${
					behind ? " dg-version-behind" : ""
				}`}
				aria-expanded={open}
				aria-haspopup="dialog"
				title={
					behind
						? "An update is available — open for what to do about it"
						: "DataGripe's version"
				}
				onClick={() => setOpen(!open)}
			>
				<span className="dg-version-dot" aria-hidden="true" />
				{behind ? "Update Available" : (serverVersion ?? UI_VERSION)}
			</button>

			{open && (
				<div className="dg-version-pop">
					<div className="dg-account-versions">
						<span>app</span>
						<code>{UI_VERSION}</code>
						<span>server</span>
						<code>{serverVersion ?? "…"}</code>
						{update?.latest != null && (
							<>
								<span>latest</span>
								<code>{update.latest}</code>
							</>
						)}
					</div>

					{(mismatch || bundleWaiting) && (
						<>
							<p className="dg-account-note">
								{bundleWaiting
									? "A new build is downloaded and waiting."
									: "This page is running a different build from the server."}
							</p>
							{/* One button for both, because a plain refresh is not an
								  answer to either: the worker in front of this page
								  serves what it already has until it is told to stand
								  down (stores/app.ts). */}
							<button
								type="button"
								className="dg-btn dg-btn-pri dg-version-action"
								disabled={refreshing}
								onClick={() => {
									setRefreshing(true);
									void useAppStore
										.getState()
										.refreshOntoLatest()
										.finally(() => setRefreshing(false));
								}}
							>
								{refreshing ? "refreshing…" : "refresh onto the new build"}
							</button>
						</>
					)}

					{version?.updateCheck === false ? (
						<p className="dg-account-note">
							The update check is turned off on this deployment.
						</p>
					) : (
						<>
							{update !== null && (
								<p className="dg-account-note">
									{update.error !== null
										? update.error
										: update.newer
											? `DataGripe ${update.latest} is out.`
											: "This is the latest release."}
								</p>
							)}
							<button
								type="button"
								className="dg-doc-new"
								disabled={checking || restarting}
								onClick={() => void useAppStore.getState().checkForUpdate()}
							>
								{checking ? "checking…" : "check again"}
							</button>
						</>
					)}

					{update?.newer === true && version !== null && (
						<p className="dg-account-note">
							{upgradeAdvice(version.shape, version.supervised)}
						</p>
					)}

					{/* Not conditional on the check having found something: a
						  deployment building its own image from a moving tag has an
						  update the release feed has never heard of. */}
					{version?.supervised === true && canRestart && (
						<button
							type="button"
							className="dg-btn dg-btn-pri dg-version-action"
							disabled={restarting}
							onClick={restart}
						>
							{restarting ? "restarting…" : "restart to apply an update"}
						</button>
					)}

					<a
						className="dg-account-link"
						href="https://datagripe.com/docs/upgrading/"
						target="_blank"
						rel="noreferrer"
					>
						How to upgrade this →
					</a>

					{error !== null && <p className="dg-test-failed">{error}</p>}
				</div>
			)}
		</div>
	);
}
