import type { Capability, WorkspaceRoleEntry } from "@datagripe/contracts";
import {
	CAPABILITY_GROUPS,
	CAPABILITY_LABELS,
	ROLE_NAME_MAX,
} from "@datagripe/contracts";
import { Fragment, useState } from "react";
import { wsClient } from "../api/ws";
import { TextInput } from "./controls";
import { IconClose } from "./icons";

/**
 * The roles a project has, and what each may do
 * (docs/spec/permissions.md).
 *
 * A matrix, because the question is two-dimensional and any other shape
 * makes you hold one axis in your head. Owner, editor and viewer are
 * here as rows like any other — their capabilities are editable, their
 * names are not, and they cannot be deleted, so "owner" means the same
 * thing in every project even when a project has rewritten what an
 * owner may do.
 *
 * Read-only for somebody who cannot manage members: knowing what the
 * roles here can do is how you know what to ask for.
 */

export function RolesSection(props: {
	canManage: boolean;
	/** Null while the first read is in flight. */
	roles: WorkspaceRoleEntry[] | null;
	/** Owned by the parent, because the member rows pick from the same
	 * list and a role added here has to appear there. */
	reload: () => void;
}) {
	const roles = props.roles;
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [newName, setNewName] = useState("");
	const reload = props.reload;

	const save = (role: WorkspaceRoleEntry, capabilities: Capability[]) => {
		setBusy(role.id);
		setError(null);
		wsClient
			.request("role.upsert", {
				id: role.id,
				name: role.name,
				capabilities,
			})
			.catch((cause: unknown) =>
				setError(cause instanceof Error ? cause.message : "Save failed"),
			)
			.finally(() => {
				setBusy(null);
				reload();
			});
	};

	const create = () => {
		const name = newName.trim();
		if (name === "") {
			return;
		}
		setError(null);
		wsClient
			.request("role.upsert", { name, capabilities: [] })
			.then(() => setNewName(""))
			.catch((cause: unknown) =>
				setError(cause instanceof Error ? cause.message : "Could not add that"),
			)
			.finally(reload);
	};

	const remove = (role: WorkspaceRoleEntry) => {
		setError(null);
		wsClient
			.request("role.delete", { id: role.id })
			.catch((cause: unknown) =>
				setError(
					cause instanceof Error ? cause.message : "Could not remove it",
				),
			)
			.finally(reload);
	};

	if (roles === null) {
		return (
			<div className="dg-form-section">
				<span className="dg-form-section-title">Roles</span>
				<p className="dg-form-note">{error ?? "Loading…"}</p>
			</div>
		);
	}

	return (
		<div className="dg-form-section">
			<span className="dg-form-section-title">Roles</span>
			<p className="dg-form-note">
				What a member of this project may do. Owner, editor and viewer are here
				in every project and cannot be removed — what they may do is yours to
				change. Reading is not on this list: being a member is being able to
				read.
			</p>
			{error !== null && <p className="dg-test-failed">{error}</p>}

			<div className="dg-matrix-scroll dg-scroll">
				<table className="dg-matrix">
					<thead>
						<tr>
							<th className="dg-matrix-head">Capability</th>
							{roles.map((role) => (
								<th key={role.id} className="dg-matrix-role">
									<span>{role.name}</span>
									<span className="dg-matrix-members">
										{role.members === 1
											? "1 member"
											: `${role.members} members`}
									</span>
									{props.canManage && role.builtin === null && (
										<button
											type="button"
											className="dg-document-delete"
											aria-label={`Remove the ${role.name} role`}
											title={
												role.members > 0
													? "Move its members to another role first"
													: `Remove the ${role.name} role`
											}
											onClick={() => remove(role)}
										>
											<IconClose />
										</button>
									)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{CAPABILITY_GROUPS.map((group) => (
							<Fragment key={group.title}>
								<tr className="dg-matrix-group">
									<th colSpan={roles.length + 1}>{group.title}</th>
								</tr>
								{group.capabilities.map((capability) => (
									<tr key={capability}>
										<th className="dg-matrix-capability">
											<span>{CAPABILITY_LABELS[capability].title}</span>
											<span className="dg-matrix-detail">
												{CAPABILITY_LABELS[capability].detail}
											</span>
										</th>
										{roles.map((role) => {
											const on = role.capabilities.includes(capability);
											return (
												<td key={role.id} className="dg-matrix-cell">
													<input
														type="checkbox"
														checked={on}
														disabled={!props.canManage || busy === role.id}
														aria-label={`${CAPABILITY_LABELS[capability].title} — ${role.name}`}
														onChange={() =>
															save(
																role,
																on
																	? role.capabilities.filter(
																			(held) => held !== capability,
																		)
																	: [...role.capabilities, capability],
															)
														}
													/>
												</td>
											);
										})}
									</tr>
								))}
							</Fragment>
						))}
					</tbody>
				</table>
			</div>

			{props.canManage && (
				<div className="dg-frow dg-matrix-new">
					<TextInput
						value={newName}
						maxLength={ROLE_NAME_MAX}
						placeholder="support, analyst, release…"
						aria-label="New role name"
						onChange={(event) => setNewName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								create();
							}
						}}
					/>
					<button
						type="button"
						className="dg-btn"
						disabled={newName.trim() === ""}
						onClick={create}
					>
						add a role
					</button>
				</div>
			)}
		</div>
	);
}
