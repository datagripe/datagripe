import { describe, expect, test } from "bun:test";
import { languageForName, uniqueName } from "./documents";

/**
 * The one language rule (docs/spec/markdown-documents.md "Where a
 * language comes from").
 *
 * It lives in contracts because the server applies it on save and the
 * client applies it on the way into the sidebar, and the two disagreeing
 * would mean a runbook that renders in one place and highlights as SQL
 * in the other.
 */

describe("languageForName", () => {
	test("markdown extensions, case-insensitively", () => {
		for (const name of [
			"maintenance.md",
			"README.MD",
			"notes.Markdown",
			"docs/runbooks/nightly.md",
		]) {
			expect(languageForName(name)).toBe("markdown");
		}
	});

	test("sql extensions, and a name with no extension at all", () => {
		for (const name of [
			"blah.sql",
			"query22.SQL",
			// Nobody has named this yet, and an unnamed document is a query.
			"notes",
			// The extension is the *last* one: `a.md.sql` is a SQL file
			// somebody named oddly, not a markdown file.
			"a.md.sql",
		]) {
			expect(languageForName(name)).toBe("sql");
		}
	});

	test("any other extension is plain text rather than refused", () => {
		for (const name of [
			"analysis.json",
			"weird.mdx",
			"docker-compose.yaml",
			"notes.txt",
			"data/rows.csv",
		]) {
			expect(languageForName(name)).toBe("plaintext");
		}
	});

	test("a name that is only an extension still resolves", () => {
		expect(languageForName(".md")).toBe("markdown");
		// A dotfile is a name, not an extension: `.env` is called .env.
		expect(languageForName(".env")).toBe("sql");
		expect(languageForName("")).toBe("sql");
	});
});

/**
 * Two files with one name (docs/spec/editor-workspace.md). A collision
 * suggests rather than refuses: typing a name that is taken is far more
 * often "I want another one of these" than a mistake.
 */
describe("uniqueName", () => {
	test("a free name is left alone", () => {
		expect(uniqueName("query-1.sql", ["notes.md"])).toBe("query-1.sql");
	});

	test("a taken name counts up before the extension", () => {
		expect(uniqueName("query.sql", ["query.sql"])).toBe("query-1.sql");
		expect(uniqueName("query.sql", ["query.sql", "query-1.sql"])).toBe(
			"query-2.sql",
		);
	});

	test("case does not make two files distinguishable", () => {
		expect(uniqueName("Notes.md", ["notes.md"])).toBe("Notes-1.md");
	});

	test("a name with no extension counts up at the end", () => {
		expect(uniqueName("notes", ["notes"])).toBe("notes-1");
	});

	test("the document being renamed does not collide with itself", () => {
		expect(uniqueName("notes.md", ["notes.md"], { except: "notes.md" })).toBe(
			"notes.md",
		);
	});
});
