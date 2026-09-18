import type {
	DomainTag,
	DomainTarget,
	SchemaPathSegment,
} from "@datagripe/contracts";
import { domainTargetKey } from "@datagripe/contracts";
import type { ConnectionsService, WorkspaceRef } from "../connections/service";
import type { AppDb } from "../db/app/pool";
import { listDomains } from "./service";

const categories: Record<DomainTarget["kind"], SchemaPathSegment["kind"]> = {
	table: "tables",
	view: "views",
	function: "functions",
	procedure: "procedures",
	sequence: "sequences",
};

/** Read every relevant catalog before removing anything. A failed read is
 * not evidence that an object was dropped. Routine names include the full
 * identity arguments, so a changed signature becomes a new, untagged object. */
export async function staleTags(
	connections: Pick<ConnectionsService, "schemaChildren">,
	workspace: WorkspaceRef,
	connectionRef: string,
	tags: DomainTag[],
): Promise<DomainTag[]> {
	const groups = new Map<string, DomainTarget>();
	for (const { target } of tags) {
		groups.set(JSON.stringify([target.schema, target.kind]), target);
	}
	const live = new Set<string>();
	for (const target of groups.values()) {
		const category = categories[target.kind];
		const nodes = await connections.schemaChildren(
			workspace,
			connectionRef,
			[
				{ kind: "schema", name: target.schema },
				{ kind: category, name: category },
			],
			true,
		);
		for (const node of nodes) {
			live.add(
				domainTargetKey({
					schema: target.schema,
					kind: target.kind,
					name: node.name,
				}),
			);
		}
	}
	return tags.filter(({ target }) => !live.has(domainTargetKey(target)));
}

export async function reconcileDomains(
	appDb: AppDb,
	connections: Pick<ConnectionsService, "schemaChildren">,
	workspace: WorkspaceRef,
	connectionRef: string,
	persist = true,
) {
	const listed = await listDomains(appDb, workspace.id, connectionRef);
	const stale = await staleTags(
		connections,
		workspace,
		connectionRef,
		listed.tags,
	);
	if (persist && stale.length > 0) {
		await appDb.begin(async (tx) => {
			for (const { domainId, target } of stale) {
				await tx`
					DELETE FROM domain_tags t USING domains d
					WHERE t.domain_id = d.id AND d.workspace_id = ${workspace.id}
						AND d.connection_ref = ${connectionRef} AND t.domain_id = ${domainId}
						AND t.schema = ${target.schema} AND t.name = ${target.name}
						AND t.kind = ${target.kind}
				`;
			}
		});
	}
	const removed = new Set(stale);
	return {
		domains: listed.domains,
		tags: listed.tags.filter((tag) => !removed.has(tag)),
	};
}
