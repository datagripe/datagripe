import type { DeploymentShape } from "@datagripe/contracts";
import { useEffect, useRef, useState } from "react";
import { openAccountSettings, openProjectSettings } from "../app/viewPanels";
import { UI_VERSION, useAppStore } from "../stores/app";
import { useSessionStore } from "../stores/session";
import { avatarSlot, gravatarUrl, initials } from "../utils/gravatar";

/**
 * The account menu (docs/spec/updates.md "The menu").
 *
 * One avatar in the header, in place of the four controls that used to
 * sit there — role, a cog, an address and a log-out button, none of
 * which is needed often enough to spend the width on. Behind it: who you
 * are and where, the two settings panels, the way out, and what version
 * this is.
 *
 * The versions are here rather than in an About box because the
 * question people actually arrive with is "am I on the latest, and how
 * do I get there" — and the answer to the second half depends entirely
 * on how this deployment runs, which the server knows and the reader
 * often does not.
 */

/** What applying an update looks like, per shape. */
function upgradeAdvice(shape: DeploymentShape, supervised: boolean): string {
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

export function AccountMenu() {
	const [open, setOpen] = useState(false);
	const [avatar, setAvatar] = useState<string | null>(null);
	const [avatarFailed, setAvatarFailed] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	const sessionUser = useSessionStore((state) => state.bootstrap?.user ?? null);
	const authDisabled = useSessionStore(
		(state) => state.bootstrap?.authDisabled ?? false,
	);
	const workspace = useSessionStore((state) => state.currentWorkspace);
	const logout = useSessionStore((state) => state.logout);

	const version = useAppStore((state) => state.version);
	const update = useAppStore((state) => state.update);
	const checking = useAppStore((state) => state.checking);
	const restarting = useAppStore((state) => state.restarting);
	const error = useAppStore((state) => state.error);

	const email = sessionUser?.email ?? "";

	// Nothing reaches Gravatar until somebody opens the menu, and the
	// address never leaves the browser — only a hash of it does.
	useEffect(() => {
		if (!open || email === "" || avatar !== null) {
			return;
		}
		void gravatarUrl(email).then((url) => setAvatar(url));
	}, [open, email, avatar]);

	useEffect(() => {
		if (open) {
			void useAppStore.getState().loadVersion();
		}
	}, [open]);

	// Outside click and Escape, like every other popover here.
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

	const showAvatar = avatar !== null && !avatarFailed;

	return (
		<div className="dg-account" ref={rootRef}>
			<button
				type="button"
				className="dg-avatar"
				aria-haspopup="menu"
				aria-expanded={open}
				title={email === "" ? "This server has no accounts" : email}
				aria-label="Account and version"
				data-slot={avatarSlot(email)}
				onClick={() => setOpen(!open)}
			>
				{showAvatar ? (
					<img
						src={avatar}
						alt=""
						width={22}
						height={22}
						onError={() => setAvatarFailed(true)}
					/>
				) : (
					<span aria-hidden="true">{initials(email || "?")}</span>
				)}
			</button>

			{open && (
				<div className="dg-account-pop" role="menu">
					<div className="dg-account-who">
						{workspace !== null && (
							<b className="dg-account-project">{workspace.name}</b>
						)}
						{/* Role and address, in one line, and something honest
							  when there is neither: a server with no accounts has
							  no identity to show and should say so rather than
							  leave a blank row. */}
						<span className="dg-account-meta">
							{[workspace?.role, email === "" ? undefined : email]
								.filter((part) => part !== undefined)
								.join(" · ") || "No accounts on this server"}
						</span>
					</div>

					<div className="dg-account-rows">
						{workspace !== null && (
							<button
								type="button"
								className="dg-account-row"
								role="menuitem"
								onClick={() => {
									setOpen(false);
									openProjectSettings();
								}}
							>
								Project settings
							</button>
						)}
						<button
							type="button"
							className="dg-account-row"
							role="menuitem"
							onClick={() => {
								setOpen(false);
								openAccountSettings();
							}}
						>
							Account settings
						</button>
						{!authDisabled && (
							<button
								type="button"
								className="dg-account-row"
								role="menuitem"
								onClick={() => {
									setOpen(false);
									void logout();
								}}
							>
								Log out
							</button>
						)}
					</div>

					<div className="dg-account-version">
						<div className="dg-account-versions">
							<span>app</span>
							<code>{UI_VERSION}</code>
							<span>server</span>
							<code>{version?.server ?? "…"}</code>
						</div>
						{version !== null && version.server !== UI_VERSION && (
							// The one mismatch worth naming: a service worker that
							// has not been applied leaves exactly this behind.
							<p className="dg-account-note">
								This page is running an older build than the server. Refresh to
								catch up.
							</p>
						)}

						{version?.updateCheck === false ? (
							<p className="dg-account-note">
								The update check is turned off on this deployment.
							</p>
						) : (
							<button
								type="button"
								className="dg-doc-new"
								disabled={checking || restarting}
								onClick={() => void useAppStore.getState().checkForUpdate()}
							>
								{checking ? "checking…" : "check for updates"}
							</button>
						)}

						{update !== null && (
							<p className="dg-account-note">
								{update.error !== null
									? update.error
									: update.newer
										? `DataGripe ${update.latest} is out.`
										: `Up to date — ${update.latest} is the latest release.`}
							</p>
						)}

						{update?.newer === true && version !== null && (
							<p className="dg-account-note">
								{upgradeAdvice(version.shape, version.supervised)}
							</p>
						)}

						{/* Not conditional on the check having found something. A
							  deployment that builds its own image from a moving tag
							  has an update the release feed has never heard of, and
							  restarting is how that one is applied too. */}
						{version?.supervised === true && workspace?.role === "owner" && (
							<button
								type="button"
								className="dg-btn dg-btn-pri dg-account-restart"
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
				</div>
			)}
		</div>
	);
}
