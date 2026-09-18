import { describe, expect, test } from "bun:test";
import type { DomainTag } from "@datagripe/contracts";
import type { ConnectionsService } from "../connections/service";
import { staleTags } from "./reconcile";

const workspace = { id: "workspace", name: "Workspace" };
const tags: DomainTag[] = [
	{
		domainId: "billing",
		target: {
			schema: "backoffice",
			kind: "function",
			name: "provider_rule_add(_vip text)",
		},
	},
	{
		domainId: "billing",
		target: {
			schema: "backoffice",
			kind: "function",
			name: "provider_rule_add(_vip boolean)",
		},
	},
	{
		domainId: "hidden",
		target: { schema: "backoffice", kind: "table", name: "removed" },
	},
];

describe("live domain reconciliation", () => {
	test("removes old signatures and dropped objects, retaining the live overload", async () => {
		const calls: unknown[] = [];
		const connections: Pick<ConnectionsService, "schemaChildren"> = {
			async schemaChildren(ws, ref, path, refresh) {
				calls.push({ ws, ref, path, refresh });
				return path[1]?.kind === "functions"
					? [
							{
								kind: "function",
								name: "provider_rule_add(_vip boolean)",
								hasChildren: false,
							},
						]
					: [];
			},
		};
		expect(await staleTags(connections, workspace, "db", tags)).toEqual(
			tags.filter((_, index) => index !== 1),
		);
		expect(calls).toHaveLength(2);
		for (const call of calls)
			expect(call).toMatchObject({ ws: workspace, ref: "db", refresh: true });
	});

	test("a failed later catalog read aborts instead of returning partial deletions", async () => {
		const connections: Pick<ConnectionsService, "schemaChildren"> = {
			async schemaChildren(_ws, _ref, path) {
				if (path[1]?.kind === "tables") throw new Error("permission denied");
				return [];
			},
		};
		await expect(staleTags(connections, workspace, "db", tags)).rejects.toThrow(
			"permission denied",
		);
	});
});
