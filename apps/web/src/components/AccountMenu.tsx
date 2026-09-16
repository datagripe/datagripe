import { useEffect, useRef, useState } from "react";
import { openAccountSettings, openProjectSettings } from "../app/viewPanels";
import { useSessionStore } from "../stores/session";
import { avatarSlot, gravatarUrl, initials } from "../utils/gravatar";

/**
 * The account menu (docs/spec/updates.md "The menu").
 *
 * One avatar in the header, in place of the four controls that used to
 * sit there — role, a cog, an address and a log-out button, none of
 * which is needed often enough to spend the width on. Behind it: who you
 * are and where, the two settings panels, and the way out.
 *
 * The button is the full height of the bar and wears the same corner
 * radius as every other button here: this is a square-cornered
 * interface, and one circle in it reads as an import from a different
 * product. It carries your name when you have set one
 * (Account settings → Name) and your initials when you have not.
 *
 * Versions live at the other end of the window, in the status bar
 * (components/VersionStatus.tsx). They are a property of the
 * deployment, not of you.
 */

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

	const name = useSessionStore((state) => state.bootstrap?.user?.name ?? "");

	const email = sessionUser?.email ?? "";

	// Nothing reaches Gravatar until somebody opens the menu, and the
	// address never leaves the browser — only a hash of it does.
	useEffect(() => {
		if (!open || email === "" || avatar !== null) {
			return;
		}
		void gravatarUrl(email).then((url) => setAvatar(url));
	}, [open, email, avatar]);

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

	const showAvatar = avatar !== null && !avatarFailed;

	return (
		<div className="dg-account" ref={rootRef}>
			<button
				type="button"
				className={`dg-avatar${name === "" ? "" : " dg-avatar-named"}`}
				aria-haspopup="menu"
				aria-expanded={open}
				title={email === "" ? "This server has no accounts" : email}
				aria-label="Account"
				data-slot={avatarSlot(email)}
				onClick={() => setOpen(!open)}
			>
				<span className="dg-avatar-face" data-slot={avatarSlot(email)}>
					{showAvatar ? (
						<img src={avatar} alt="" onError={() => setAvatarFailed(true)} />
					) : (
						<span aria-hidden="true">{initials(name || email || "?")}</span>
					)}
				</span>
				{name !== "" && <span className="dg-avatar-name">{name}</span>}
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
				</div>
			)}
		</div>
	);
}
