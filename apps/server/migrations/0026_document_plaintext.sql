-- Plain text as the third document language
-- (docs/spec/markdown-documents.md "Where a language comes from").
--
-- The files tree accepted two extensions and called everything else
-- SQL, so a `.yaml` opened out of a datasource path was highlighted as
-- a query and a `.csv` was a syntax error with a thousand findings. The
-- rule is now the extension, honestly: `.md` is markdown, `.sql` is
-- SQL, anything else is plain text, and a name with no extension is
-- still SQL because a document nobody has named yet is a query.
ALTER TABLE documents
	DROP CONSTRAINT IF EXISTS documents_language_check;

ALTER TABLE documents
	ADD CONSTRAINT documents_language_check
		CHECK (language IN ('sql', 'markdown', 'plaintext'));

-- Backfill by the same rule the code applies. Anything with a dot in
-- the last segment of its name, that is not markdown or SQL, was being
-- called SQL and is not.
UPDATE documents
SET language = 'plaintext'
WHERE language = 'sql'
	AND lower(coalesce(origin_file_path, title)) ~ '[^/.][.][^/.]+$'
	AND lower(coalesce(origin_file_path, title)) NOT LIKE '%.sql';
