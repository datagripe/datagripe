import { z } from "zod";

/** Document and editor-view domain contracts. */

/**
 * Where a document came from, when it did not come from nowhere.
 *
 * A file opened out of a datasource path (docs/spec/datasource-paths.md)
 * is a normal workspace document — cached in the app database so it gets
 * the same live multiplayer state as any shared file — that additionally
 * knows which file on disk it *is*. Saves write both.
 */
export const documentOriginSchema = z.object({
	/** `ConnectionMetadata.id`: a managed UUID or a predefined slug. */
	connectionRef: z.string().min(1).max(255),
	/** `DatasourcePath.id` — which configured root it lives under. */
	pathId: z.uuid(),
	/** POSIX-relative to that root. */
	filePath: z.string().min(1).max(1024),
});

export type DocumentOrigin = z.infer<typeof documentOriginSchema>;

/**
 * The languages, and the rule for picking one, are
 * docs/spec/markdown-documents.md: the extension of the *name* decides,
 * in every files area. A `.md` file in a checkout is a runbook whose SQL
 * blocks are runnable in place.
 *
 * `plaintext` is the third because a files tree that only accepts two
 * extensions is a files tree that refuses `.csv`, `.yaml` and
 * `.env.example` — and refusing to open a file is worse than opening it
 * with no highlighting. It is a name for "no formatting", not a feature.
 */
export const documentLanguageSchema = z.enum(["sql", "markdown", "plaintext"]);

export type DocumentLanguage = z.infer<typeof documentLanguageSchema>;

/** Extensions that make a document markdown. Case-insensitive. */
const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

/** Extensions that make a document SQL. Case-insensitive. */
const SQL_EXTENSIONS = [".sql"];

/**
 * The one rule, shared by the server and the client so they cannot
 * disagree: the extension of the name decides. Markdown for `.md`, SQL
 * for `.sql`, plain text for any other extension — and SQL for a name
 * with no extension at all, because a document nobody has named yet is
 * a query. Applied to a file-backed document's path, and to a workspace
 * file or scratchpad's title.
 */
export function languageForName(name: string): DocumentLanguage {
	const lower = name.toLowerCase();
	if (MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
		return "markdown";
	}
	if (SQL_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
		return "sql";
	}
	return hasExtension(lower) ? "plaintext" : "sql";
}

/** A dot in the last segment, and something after it. */
function hasExtension(name: string): boolean {
	const segment = name.slice(name.lastIndexOf("/") + 1);
	const dot = segment.lastIndexOf(".");
	return dot > 0 && dot < segment.length - 1;
}

/**
 * The name with `-1`, `-2`, … before its extension until nothing else
 * in the list is called that, case-insensitively — two files whose
 * names differ only in case are two files nobody can tell apart in a
 * sidebar.
 *
 * Used where a name is chosen rather than refused: creating and
 * renaming both suggest, and the person can rename afterwards.
 */
export function uniqueName(
	wanted: string,
	taken: Iterable<string>,
	options: { except?: string } = {},
): string {
	const used = new Set<string>();
	for (const name of taken) {
		if (options.except !== undefined && name === options.except) {
			continue;
		}
		used.add(name.toLowerCase());
	}
	if (!used.has(wanted.toLowerCase())) {
		return wanted;
	}
	const dot = hasExtension(wanted) ? wanted.lastIndexOf(".") : wanted.length;
	const stem = wanted.slice(0, dot);
	const extension = wanted.slice(dot);
	let suffix = 1;
	while (used.has(`${stem}-${suffix}${extension}`.toLowerCase())) {
		suffix++;
	}
	return `${stem}-${suffix}${extension}`;
}

export const documentSchema = z.object({
	id: z.uuid(),
	workspaceId: z.uuid(),
	title: z.string().min(1).max(255),
	language: documentLanguageSchema,
	content: z.string(),
	revision: z.number().int().nonnegative(),
	defaultConnectionId: z.uuid().optional(),
	/** Null for scratchpads and plain workspace files. */
	origin: documentOriginSchema.nullable().default(null),
	updatedAt: z.iso.datetime(),
});

export type Document = z.infer<typeof documentSchema>;

export const documentSaveRequestSchema = z.object({
	id: z.uuid(),
	content: z.string(),
	revision: z.number().int().nonnegative(),
	/** Rename during save. */
	title: z.string().min(1).max(255).optional(),
	/** Overwrite despite a revision mismatch (user chose keep-mine). */
	force: z.boolean().default(false),
	idempotencyKey: z.string().min(8).max(128),
});

export type DocumentSaveRequest = z.infer<typeof documentSaveRequestSchema>;

export const documentCreateRequestSchema = z.object({
	/** Client-chosen id keeps local and server ids aligned (idempotent). */
	id: z.uuid().optional(),
	title: z.string().min(1).max(255),
	content: z.string().default(""),
	defaultConnectionId: z.uuid().optional(),
	idempotencyKey: z.string().min(8).max(128),
});

export type DocumentCreateRequest = z.infer<typeof documentCreateRequestSchema>;
