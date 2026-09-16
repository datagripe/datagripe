import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "../persistence/db";
import type { Debouncer } from "../persistence/debounce";
import {
	createDocumentsStore,
	type DocumentsStore,
	nextUntitledIndex,
} from "./documents";

/**
 * Runs scheduled tasks synchronously and records the last returned promise
 * so tests can await persistence deterministically.
 */
function createImmediateDebouncer() {
	const tracker = { last: Promise.resolve() as Promise<unknown> };
	const debouncer: Debouncer = {
		schedule: (_key, task) => {
			tracker.last = Promise.resolve(task());
		},
		flush: () => {},
		cancel: () => {},
		pending: () => false,
	};
	return { debouncer, tracker };
}

let idCounter = 0;
let clock = 0;

function createTestStore(): {
	store: DocumentsStore;
	tracker: { last: Promise<unknown> };
} {
	const { debouncer, tracker } = createImmediateDebouncer();
	return {
		store: createDocumentsStore({
			debouncer,
			now: () => new Date(1_800_000_000_000 + clock++ * 1000).toISOString(),
			newId: () => {
				idCounter++;
				return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
			},
		}),
		tracker,
	};
}

beforeEach(async () => {
	await Promise.all([
		db.documents.clear(),
		db.drafts.clear(),
		db.layouts.clear(),
		db.viewStates.clear(),
	]);
});

describe("documents store", () => {
	test("createDocument persists an empty saved row immediately", async () => {
		const { store, tracker } = createTestStore();
		const doc = store.getState().createDocument();
		expect(doc.title).toBe("query-1.sql");
		await tracker.last;
		const row = await db.documents.get(doc.id);
		expect(row).toMatchObject({ content: "", revision: 0 });
	});

	test("titles increment and skip used indices", () => {
		expect(nextUntitledIndex([])).toBe(1);
		expect(nextUntitledIndex(["query-1.sql", "query-2.sql"])).toBe(3);
		expect(nextUntitledIndex(["query-1.sql", "query-3.sql"])).toBe(2);
		expect(nextUntitledIndex(["notes.txt", "query-9.sql"])).toBe(1);
	});

	test("updateContent marks dirty and checkpoints a draft", async () => {
		const { store, tracker } = createTestStore();
		const doc = store.getState().createDocument();
		store.getState().updateContent(doc.id, "select 1;");
		await tracker.last;

		const updated = store.getState().documents[doc.id];
		expect(updated).toMatchObject({
			currentContent: "select 1;",
			dirty: true,
			savedContent: "",
		});
		const draft = await db.drafts.get(doc.id);
		expect(draft).toMatchObject({ content: "select 1;", baseRevision: 0 });
	});

	test("typing back to the saved content clears the dirty flag", () => {
		const { store } = createTestStore();
		const doc = store.getState().createDocument();
		store.getState().updateContent(doc.id, "select 1;");
		store.getState().updateContent(doc.id, "");
		expect(store.getState().documents[doc.id]?.dirty).toBe(false);
	});

	test("saveDocument bumps revision, persists content, deletes the draft", async () => {
		const { store, tracker } = createTestStore();
		const doc = store.getState().createDocument();
		store.getState().updateContent(doc.id, "select 1;");
		await tracker.last;

		await store.getState().saveDocument(doc.id);

		const saved = store.getState().documents[doc.id];
		expect(saved).toMatchObject({
			savedContent: "select 1;",
			revision: 1,
			dirty: false,
		});
		expect(await db.documents.get(doc.id)).toMatchObject({
			content: "select 1;",
			revision: 1,
		});
		expect(await db.drafts.get(doc.id)).toBeUndefined();
	});

	test("discardDocument removes document, draft, and view states", async () => {
		const { store, tracker } = createTestStore();
		const doc = store.getState().createDocument();
		store.getState().updateContent(doc.id, "select 1;");
		await tracker.last;
		await db.viewStates.put({
			id: "view-1",
			documentId: doc.id,
			state: {},
			updatedAt: new Date().toISOString(),
		});

		await store.getState().discardDocument(doc.id);

		expect(store.getState().documents[doc.id]).toBeUndefined();
		expect(store.getState().order).toEqual([]);
		expect(await db.documents.get(doc.id)).toBeUndefined();
		expect(await db.drafts.get(doc.id)).toBeUndefined();
		expect(await db.viewStates.get("view-1")).toBeUndefined();
	});

	test("hydrate recovers dirty drafts over saved rows", async () => {
		await db.documents.put({
			id: "11111111-1111-4111-8111-111111111111",
			title: "query-1.sql",
			content: "select 1;",
			revision: 2,
			createdAt: "2026-08-31T10:00:00.000Z",
			updatedAt: "2026-08-31T10:00:00.000Z",
		});
		await db.drafts.put({
			id: "11111111-1111-4111-8111-111111111111",
			content: "select 1; -- edited",
			baseRevision: 2,
			updatedAt: "2026-08-31T10:05:00.000Z",
		});

		const { store } = createTestStore();
		await store.getState().hydrate("ws-test");

		const doc =
			store.getState().documents["11111111-1111-4111-8111-111111111111"];
		expect(doc).toMatchObject({
			currentContent: "select 1; -- edited",
			savedContent: "select 1;",
			dirty: true,
			revision: 2,
		});
		expect(store.getState().hydrated).toBe(true);
	});
});

/**
 * Naming (docs/spec/editor-workspace.md). The name decides the
 * language, and two files in one list may not share one.
 */
describe("naming a document", () => {
	test("a new file takes the name it was given", () => {
		const { store } = createTestStore();
		const doc = store.getState().createDocument("nightly.md");
		expect(doc).toMatchObject({ title: "nightly.md", language: "markdown" });
	});

	test("a colliding name counts up rather than being refused", () => {
		const { store } = createTestStore();
		store.getState().createDocument("notes.md");
		const second = store.getState().createDocument("notes.md");
		const third = store.getState().createDocument("notes.md");
		expect(second.title).toBe("notes-1.md");
		expect(third.title).toBe("notes-2.md");
	});

	// A scratchpad and a shared file are two lists, and a name taken in
	// one says nothing about the other.
	test("the two lists collide separately", () => {
		const { store } = createTestStore();
		store.getState().createDocument("notes.md", true);
		const scratch = store.getState().createDocument("notes.md", false);
		expect(scratch.title).toBe("notes.md");
	});

	test("renaming to .md makes it markdown, without a reload", () => {
		const { store } = createTestStore();
		const doc = store.getState().createDocument();
		expect(doc.language).toBe("sql");
		store.getState().renameDocument(doc.id, "runbook.md");
		expect(store.getState().documents[doc.id]).toMatchObject({
			title: "runbook.md",
			language: "markdown",
		});
	});

	test("an unknown extension is plain text, not a syntax error", () => {
		const { store } = createTestStore();
		const doc = store.getState().createDocument("rows.csv");
		expect(doc.language).toBe("plaintext");
	});

	test("renaming onto a taken name counts up too", async () => {
		const { store } = createTestStore();
		store.getState().createDocument("notes.md");
		const other = store.getState().createDocument("other.md");
		store.getState().renameDocument(other.id, "notes.md");
		expect(store.getState().documents[other.id]?.title).toBe("notes-1.md");
		await Promise.resolve();
	});

	test("renaming a document to its own name is not a collision", () => {
		const { store } = createTestStore();
		const doc = store.getState().createDocument("notes.md");
		store.getState().renameDocument(doc.id, "notes.md");
		expect(store.getState().documents[doc.id]?.title).toBe("notes.md");
	});
});

/** Reverting (the sidebar's "revert to last save"). */
describe("revertDocument", () => {
	test("throws away the edits and the draft, and keeps the save", async () => {
		const { store, tracker } = createTestStore();
		const doc = store.getState().createDocument();
		store.getState().updateContent(doc.id, "select 1;");
		await tracker.last;
		await store.getState().saveDocument(doc.id);
		store.getState().updateContent(doc.id, "drop table orders;");
		await tracker.last;
		expect(await db.drafts.get(doc.id)).toBeDefined();

		await store.getState().revertDocument(doc.id);

		expect(store.getState().documents[doc.id]).toMatchObject({
			currentContent: "select 1;",
			savedContent: "select 1;",
			dirty: false,
			revision: 1,
		});
		expect(await db.drafts.get(doc.id)).toBeUndefined();
		// The saved row is untouched: reverting is not a write.
		expect(await db.documents.get(doc.id)).toMatchObject({
			content: "select 1;",
			revision: 1,
		});
	});

	test("a clean document has nothing to revert", async () => {
		const { store } = createTestStore();
		const doc = store.getState().createDocument();
		await store.getState().revertDocument(doc.id);
		expect(store.getState().documents[doc.id]?.currentContent).toBe("");
	});
});
