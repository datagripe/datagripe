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

- **Embedded mode** (`bun run dev`, the desktop app, `bunx
  @datagripe/cli personal`) migrates itself at startup. Restarting is
  enough.
- **External mode** (`APP_DATABASE_URL` set — the compose setup, Docker,
  Kubernetes) does **not** migrate at startup. Run `bun run db:migrate`,
  which is also what the deployment docs tell operators.

That asymmetry is the one that wastes an afternoon: a new migration in
a checkout with `.env` pointing at a real PostgreSQL does nothing until
you run it by hand, and the failure is a constraint violation from the
old schema rather than anything mentioning migrations.

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
