import { describe, expect, test } from "bun:test";
import { PresenceTracker } from "./presence";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const ALICE = {
	userId: "00000000-0000-4000-8000-0000000000a1",
	email: "alice@x.dev",
	name: "Alice",
};
const BOB = {
	userId: "00000000-0000-4000-8000-0000000000b2",
	email: "bob@x.dev",
	name: null,
};

describe("PresenceTracker", () => {
	test("join/leave broadcast only on transitions", () => {
		const tracker = new PresenceTracker();
		expect(tracker.join(WORKSPACE, ALICE)).not.toBeNull();
		// second socket of the same user — no broadcast
		expect(tracker.join(WORKSPACE, ALICE)).toBeNull();
		expect(tracker.list(WORKSPACE)).toHaveLength(1);

		expect(tracker.leave(WORKSPACE, ALICE.userId)).toBeNull(); // one socket left
		expect(tracker.leave(WORKSPACE, ALICE.userId)).not.toBeNull();
		expect(tracker.list(WORKSPACE)).toHaveLength(0);
	});

	test("focus broadcasts only on change", () => {
		const tracker = new PresenceTracker();
		tracker.join(WORKSPACE, ALICE);
		tracker.join(WORKSPACE, BOB);

		expect(
			tracker.focus(
				WORKSPACE,
				ALICE.userId,
				"00000000-0000-4000-8000-0000000000d1",
			),
		).not.toBeNull();
		// unchanged → silent
		expect(
			tracker.focus(
				WORKSPACE,
				ALICE.userId,
				"00000000-0000-4000-8000-0000000000d1",
			),
		).toBeNull();

		const list = tracker.list(WORKSPACE);
		expect(list.find((u) => u.userId === ALICE.userId)?.activeDocumentId).toBe(
			"00000000-0000-4000-8000-0000000000d1",
		);
		expect(
			list.find((u) => u.userId === BOB.userId)?.activeDocumentId,
		).toBeNull();
	});
});

describe("renaming while connected", () => {
	test("a new name broadcasts; the same one does not", () => {
		const tracker = new PresenceTracker();
		tracker.join(WORKSPACE, BOB);
		expect(tracker.list(WORKSPACE)[0]?.name).toBeNull();

		const renamed = tracker.rename(WORKSPACE, BOB.userId, "Bob");
		expect(renamed?.[0]?.name).toBe("Bob");
		// Nobody is going to reconnect to be called the right thing, and
		// nobody should be told twice.
		expect(tracker.rename(WORKSPACE, BOB.userId, "Bob")).toBeNull();
		expect(tracker.rename(WORKSPACE, "nobody", "Ghost")).toBeNull();
	});
});
