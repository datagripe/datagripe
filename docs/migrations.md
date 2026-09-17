# Migrations

The app database's schema is `apps/server/migrations/NNNN_name.sql`,
applied in filename order and recorded in `schema_migrations`. There is
no down migration and no ORM: the files are the schema, and
`git log apps/server/migrations` is its history.

## Adding one

1. Next number, kebab name: `0027_what_it_does.sql`. The number is the
   order, so two branches that both take `0027` conflict on purpose.
2. Write what changed **and why** at the top. Every file in there does;
   the comment is usually the only place the reasoning survives.
3. Make it re-runnable where it is cheap to (`IF NOT EXISTS`,
   `DROP CONSTRAINT IF EXISTS`), because a half-applied deploy is a
   thing that happens.
4. Backfill in the same file as the schema change. A column added in one
   release and filled in the next is a release where the code has to
   handle both.

## Applying it

The app checks `schema_migrations` on every startup, in embedded and
external database modes, and applies missing files before accepting HTTP
or WebSocket connections. Each migration and its history row commit
together. A PostgreSQL advisory lock serializes concurrent app starts and
manual runners; a failed migration rolls back and stops startup. The app
database account must have permission to apply the schema changes.

`bun run db:migrate` and `datagripe migrate` remain available for applying
changes before rollout. Compose services, Helm hooks and init containers
may still run them; startup rechecks the history and skips applied files.
The app process owns this work, not the PostgreSQL pod or a database trigger.

## Widening a constraint

A `CHECK (x IN (…))` that gains a value is three statements, not one —
drop the old constraint by name, add it back widened, then backfill the
rows that were only ever wrong because the constraint was narrow:

```sql
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_language_check;
ALTER TABLE documents ADD CONSTRAINT documents_language_check
  CHECK (language IN ('sql', 'markdown', 'plaintext'));

UPDATE documents SET language = 'plaintext' WHERE …;
```

The constraint's name is PostgreSQL's default (`<table>_<column>_check`)
unless the original named it. Check with `\d <table>` rather than
guessing — a `DROP CONSTRAINT` naming something that does not exist is
silent with `IF EXISTS` and leaves the old rule in place.

## What a migration means for a release

Nothing special at tag time ([releasing.md](releasing.md)), because the
deployment applies it. It is worth a sentence in the CHANGELOG entry
all the same: the operator reading the release notes is the person who
finds out otherwise.
