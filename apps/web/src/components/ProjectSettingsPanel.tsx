import type {
	Capability,
	WorkspaceMember,
	WorkspaceMembersResult,
	WorkspaceRoleEntry,
} from "@datagripe/contracts";
import { useCallback, useEffect, useState } from "react";
import { wsClient } from "../api/ws";
import {
	PROJECT_CLASS_COLORS,
	PROJECT_CLASSES,
	useBrandingStore,
} from "../stores/branding";
import { useSessionStore } from "../stores/session";
import { Select, TextInput } from "./controls";
import { IconClose } from "./icons";
import { MockBadge } from "./MockBadge";
import { RolesSection } from "./RolesSection";

/**
 * Project settings tab (header cog): rename, the mock class picker, and
 * member management — the surfaces that used to be the prompt menu's
 * class select and the Members modal. Rename and member edits are
 * owner-only; everyone else sees the current values.
 */
/** Stable, so the selector above does not re-render on every read. */
const EMPTY_CAPABILITIES: Capability[] = [];

export function ProjectSettingsPanel() {
	const currentWorkspace = useSessionStore((state) => state.currentWorkspace);
	const authDisabled = useSessionStore(
		(state) => state.bootstrap?.authDisabled ?? false,
	);
	const projectClass = useBrandingStore((state) =>
		state.classFor(currentWorkspace?.id ?? null),
	);
	const setClass = useBrandingStore((state) => state.setClass);

	const [name, setName] = useState(currentWorkspace?.name ?? "");
	const [renameBusy, setRenameBusy] = useState(false);
	// The project's roles, owned here: the member rows pick from the same
	// list the matrix edits, and a role added in one has to appear in the
	// other (docs/spec/permissions.md).
	const [roles, setRoles] = useState<WorkspaceRoleEntry[] | null>(null);
	const reloadRoles = useCallback(() => {
		void wsClient
			.request<{ roles: WorkspaceRoleEntry[] }>("role.list", {})
			.then((result) => setRoles(result.roles))
			.catch(() => setRoles([]));
	}, []);
	useEffect(reloadRoles, [reloadRoles]);

	// What this member may do here decides what the page offers
	// (docs/spec/permissions.md).
	const capabilities = useSessionStore(
		(state) => state.currentWorkspace?.capabilities ?? EMPTY_CAPABILITIES,
	);
	const [renameError, setRenameError] = useState<string | null>(null);

	// The workspace can arrive after the panel (layout restore on boot).
	useEffect(() => {
		if (currentWorkspace !== null && name === "") {
			setName(currentWorkspace.name);
		}
	}, [currentWorkspace, name]);

	if (currentWorkspace === null) {
		return (
			<div className="dg-form dg-scroll">
				<div className="dg-form-body">
					<h3 className="dg-form-title">Project settings</h3>
					<p className="dg-form-lead">No project loaded yet.</p>
				</div>
			</div>
		);
	}

	const canManageMembers = capabilities.includes("members.manage");
	const canRename =
		capabilities.includes("project.manage") &&
		name.trim().length > 0 &&
		name.trim() !== currentWorkspace.name;

	const rename = async () => {
		setRenameBusy(true);
		setRenameError(null);
		try {
			await useSessionStore.getState().renameWorkspace(name.trim());
		} catch (err) {
			setRenameError(err instanceof Error ? err.message : "Rename failed");
		} finally {
			setRenameBusy(false);
		}
	};

	return (
		<div className="dg-form dg-scroll">
			<div className="dg-form-body">
				<h3 className="dg-form-title">Project settings</h3>
				<p className="dg-form-lead">
					<b>{currentWorkspace.name}</b> · your role: {currentWorkspace.role}
				</p>

				<div className="dg-fgrid">
					<label className="dg-field">
						<span>Name</span>
						<TextInput
							value={name}
							disabled={!canRename && name === currentWorkspace.name}
							onChange={(event) => setName(event.target.value)}
						/>
					</label>
				</div>
				{!capabilities.includes("project.manage") && (
					<p className="dg-form-note">
						Your role in this project cannot rename it.
					</p>
				)}
				{renameError !== null && (
					<p className="dg-test-failed">{renameError}</p>
				)}
				{capabilities.includes("project.manage") && (
					<div className="dg-frow">
						<button
							type="button"
							className="dg-btn dg-btn-pri"
							disabled={!canRename || renameBusy}
							onClick={() => void rename()}
						>
							{renameBusy ? "saving…" : "rename"}
						</button>
					</div>
				)}

				<fieldset className="dg-field dg-form-section">
					<legend>
						Class <MockBadge />
					</legend>
					<div className="dg-cls">
						{PROJECT_CLASSES.map((value) => (
							<button
								key={value}
								type="button"
								style={
									{ "--cc": PROJECT_CLASS_COLORS[value] } as React.CSSProperties
								}
								aria-pressed={projectClass === value}
								onClick={() => setClass(currentWorkspace.id, value)}
							>
								<span className="dg-cls-sw" />
								{value}
							</button>
						))}
					</div>
					<p className="dg-form-note">
						Decides the project accent colour in the prompt and the safety
						colour for destructive actions.
					</p>
				</fieldset>

				{!authDisabled && (
					<MembersSection
						canManage={canManageMembers}
						roles={roles ?? []}
						onChanged={reloadRoles}
					/>
				)}
				{!authDisabled && (
					<RolesSection
						canManage={canManageMembers}
						roles={roles}
						reload={reloadRoles}
					/>
				)}
			</div>
		</div>
	);
}

/** Workspace members: list for everyone; add/remove for owners. */
function MembersSection(props: {
	canManage: boolean;
	roles: WorkspaceRoleEntry[];
	/** A member moving changes the counts the matrix shows. */
	onChanged: () => void;
}) {
	const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"editor" | "viewer">("editor");
	const [error, setError] = useState<string | null>(null);

	const reload = () => {
		void wsClient
			.request<WorkspaceMembersResult>("workspace.members", {})
			.then((result) => setMembers(result.members))
			.catch((err: unknown) =>
				setError(err instanceof Error ? err.message : "Load failed"),
			);
	};

	const roles = props.roles;

	useEffect(reload, []);

	return (
		<div className="dg-form-section">
			<span className="dg-form-section-title">Members</span>
			{error !== null && <p className="dg-test-failed">{error}</p>}
			{members === null ? (
				<p className="dg-form-note">Loading…</p>
			) : (
				<ul className="dg-member-list">
					{members.map((member) => (
						<li key={member.userId} className="dg-member-row">
							<span className="dg-member-email">
								{member.name ?? member.email}
							</span>
							{props.canManage && roles.length > 0 ? (
								<Select
									className="dg-member-role"
									value={member.roleId ?? ""}
									aria-label={`Role for ${member.email}`}
									onChange={(event) => {
										setError(null);
										void wsClient
											.request("member.set-role", {
												userId: member.userId,
												roleId: event.target.value,
											})
											.then(() => {
												reload();
												props.onChanged();
											})
											.catch((err: unknown) =>
												setError(
													err instanceof Error ? err.message : "Change failed",
												),
											);
									}}
								>
									{member.roleId === null && (
										<option value="">{member.role}</option>
									)}
									{roles.map((role) => (
										<option key={role.id} value={role.id}>
											{role.name}
										</option>
									))}
								</Select>
							) : (
								<span className="dg-badge">{member.role}</span>
							)}
							{props.canManage && member.role !== "owner" && (
								<button
									type="button"
									className="dg-document-delete"
									aria-label={`Remove ${member.email}`}
									onClick={() => {
										void wsClient
											.request("workspace.member.remove", {
												userId: member.userId,
											})
											.then(reload)
											.catch((err: unknown) =>
												setError(
													err instanceof Error ? err.message : "Remove failed",
												),
											);
									}}
								>
									<IconClose />
								</button>
							)}
						</li>
					))}
				</ul>
			)}
			{props.canManage && (
				<form
					className="dg-member-add"
					onSubmit={(event) => {
						event.preventDefault();
						setError(null);
						void wsClient
							.request("workspace.member.add", {
								email: email.trim(),
								role,
							})
							.then(() => {
								setEmail("");
								reload();
							})
							.catch((err: unknown) =>
								setError(err instanceof Error ? err.message : "Add failed"),
							);
					}}
				>
					<TextInput
						type="email"
						placeholder="member@example.com"
						aria-label="Member email"
						value={email}
						required
						onChange={(event) => setEmail(event.target.value)}
					/>
					<Select
						value={role}
						aria-label="Member role"
						onChange={(event) =>
							setRole(event.target.value as "editor" | "viewer")
						}
					>
						<option value="editor">editor</option>
						<option value="viewer">viewer</option>
					</Select>
					<button type="submit">Add</button>
				</form>
			)}
		</div>
	);
}
