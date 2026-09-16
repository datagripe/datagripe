import { describe, expect, test } from "bun:test";
import { BUILTIN_ROLE_CAPABILITIES, CAPABILITIES } from "@datagripe/contracts";
import { clientActionSchema } from "@datagripe/contracts/ws";
import { CAPABILITY_FOR_ACTION, capabilityArray } from "./permissions";

/**
 * The capability map is the security boundary (docs/spec/permissions.md).
 * These are the assertions that would have caught it going wrong in the
 * three ways it can: a write that names no capability, a name that does
 * not exist, and a built-in quietly gaining or losing something.
 */

describe("the capability map", () => {
	test("every action it names exists, and names a real capability", () => {
		const actions = new Set<string>(clientActionSchema.options);
		const capabilities = new Set<string>(CAPABILITIES);
		for (const [action, capability] of Object.entries(CAPABILITY_FOR_ACTION)) {
			expect(actions.has(action)).toBe(true);
			expect(capabilities.has(capability as string)).toBe(true);
		}
	});

	// An action that writes and names nothing is readable by a viewer,
	// which is the failure this file exists to prevent. The list is
	// explicit rather than a heuristic on the name: a new write action
	// fails here until somebody decides who may do it.
	test("every writing action names a capability", () => {
		const writes = clientActionSchema.options.filter((action) =>
			/\.(create|update|delete|save|archive|set|set-.*|mutate|alter|start|cancel|dismiss|restore|tag|upsert|export|import|add|remove|stage|commit|push|pull|trust|run|rename|restart)$/.test(
				action,
			),
		);
		const unguarded = writes.filter(
			(action) =>
				CAPABILITY_FOR_ACTION[action] === undefined &&
				// Writes in grammar only: they change your own session, your
				// own layout, or something you own outright.
				![
					// Your name, your panel arrangement, where you are looking.
					"account.set-name",
					"layout.save",
					"document.focus",
					"view.broadcast",
					"view.follow",
					"execution.subscribe",
					// A new project of your own. Being able to make one is not a
					// permission inside somebody else's.
					"workspace.create",
					// Asks the release feed, and changes nothing here.
					"app.update.check",
				].includes(action),
		);
		expect(unguarded).toEqual([]);
	});

	test("the built-ins are what the three ranks always were", () => {
		expect(BUILTIN_ROLE_CAPABILITIES.viewer).toEqual([]);
		expect(BUILTIN_ROLE_CAPABILITIES.owner).toEqual(CAPABILITIES);
		// An editor could run queries, edit data and structure, manage
		// datasources and domains, commit — and could not push, sync,
		// run repo commands, touch MCP, or manage anybody.
		expect(BUILTIN_ROLE_CAPABILITIES.editor).toContain("query.run");
		expect(BUILTIN_ROLE_CAPABILITIES.editor).toContain("git.commit");
		for (const withheld of [
			"git.push",
			"sync.run",
			"repo.commands",
			"mcp.manage",
			"members.manage",
			"project.manage",
			"server.restart",
		] as const) {
			expect(BUILTIN_ROLE_CAPABILITIES.editor).not.toContain(withheld);
		}
	});
});

describe("capability arrays", () => {
	// The driver sends `[]` as '' and PostgreSQL refuses it — and the
	// viewer role is empty by definition, so this is the first row
	// inserted rather than an edge case.
	test("an empty set is an empty array, not an empty string", () => {
		expect(capabilityArray([])).toBe("{}");
	});

	test("a set is a literal PostgreSQL will read", () => {
		expect(capabilityArray(["query.run", "mcp.manage"])).toBe(
			"{query.run,mcp.manage}",
		);
	});
});
