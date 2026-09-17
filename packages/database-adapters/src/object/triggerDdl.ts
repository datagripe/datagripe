/**
 * The object view and domain sync share this DDL. Keep the original body
 * untouched when there are no triggers; otherwise separate complete SQL
 * statements without rewriting semicolons inside trigger bodies.
 */
export function withTriggerDdl(
	ddl: string | null,
	triggers: string[],
): string | null {
	if (ddl === null || triggers.length === 0) return ddl;
	return [ddl, ...triggers]
		.map((statement) => {
			const body = statement.trimEnd();
			return body.endsWith(";") ? body : `${body};`;
		})
		.join("\n\n");
}
