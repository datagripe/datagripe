---
title: Why it complains
description: The one sentence the whole feature follows from, and the four rules that fall out of it.
group: Learn
order: 1
---

Every decision in the gripes engine follows from a single sentence:

> A gripe that is merely rude is noise and users disable it within a
> week. A gripe that is correct and rude is a feature they screenshot
> into the team channel.

So correctness outranks coverage, and silence outranks a guess. The rest
of this page is what that costs.

## A rule that cannot tell says nothing

There is a hedged sentence the brand specification carries as a
counter-example, and it is worth reading because it is exactly what most
tools of this kind produce:

> Hmm, this query might be a little slow, maybe?

It is rejected for being hedged into uselessness. That is not a style
note, it is a hard property of the engine: a rule that needs the schema
and cannot see it returns nothing. It does not downgrade to a guess and
it does not append "possibly".

This has a visible consequence. The client's view of your schema is the
completion catalogue, which fetches a table's columns on demand — so a
schema rule's first look usually knows nothing, and correctly says
nothing. Asking for the columns is the side effect. When they arrive the
catalogue notifies, the analysis re-runs, and the finding appears a beat
late. Late is a cost worth paying. Wrong is not.

The same rule is why a `null` from the schema may never be read as
`false`. A rule treating "not fetched yet" as "NOT NULL" would go silent
on a real problem; one treating it as "nullable" would invent one.

## No rule is about formatting

sqlfluff exists, and it is better at that than this will ever be. A rule
earns its place in DataGripe by knowing something about *this* database —
the row count, the missing index, the column that is nullable in
practice — or by being about damage rather than tidiness.

A finding derivable from the query text alone, with no reference to the
schema or the cost, is usually a lint rule and belongs to a formatter.
Shipping those is the fastest way to get the whole feature switched off,
and a feature that is switched off catches nothing.

There is a concrete casualty. `select.unqualified-star` was specified and
is not going to ship: in a SQL client, `select * from t limit 100` is the
single most common legitimate query there is. The case with real teeth —
a star frozen into a view definition at creation — shipped as
`view.select-star`. The ad-hoc case did not.

## The wording is fixed, and written by a person

Four strings per rule. No LLM, no template shuffling, no synonym
rotation. The same rule firing twice uses the same wording; variants to
seem clever are explicitly out.

What this buys is that a gripe is *auditable*. Its footer carries
`severity · rule id · line`, and the rule id is the same string at every
attitude level and for every reader. You can grep it, dismiss it by it,
and file a bug against it.

It also means the strings are copy, reviewed like copy. Mechanical
constraints are enforced by a test — length caps, a barred-term list, no
profanity at `notice`, and every placeholder resolving — but the judgment
of whether a sentence is *good* is a person's, every time.

## It criticises the query, never you

The complaint is always about the statement, the schema or the grant. It
is never about the competence of whoever wrote it. That line is the
difference between a tool with a personality and a tool that is unpleasant
to use, and it is a hard rule rather than a preference.

Three more constraints hold it in place:

- **A gripe never blocks anything.** It does not prevent a run, gate a
  save, or fail a build. It is an opinion held loudly.
- **There is no score.** No grade, no "query health 62%". A number
  invites gaming and averages away the one blocker that mattered.
- **Everything is dismissable**, at every attitude level, and the app
  always tells you it is hiding something. See
  [dismissing gripes](/docs/dismissing-gripes/).

## Where correctness actually bit

The discipline above is cheap to write down. These are the places it
cost something, each of which is a rule that was wrong before its test
caught it:

- `delete.no-where` reads the statement's *main verb*, looking through a
  leading `WITH`. Without that, `create trigger t after delete on x`
  reads as an unqualified delete — and it would have fired on every
  trigger in the database.
- `view.select-star` distinguishes a projection star from multiplication
  by what surrounds it. Depth alone is not enough: the `*` in
  `select qty * price` sits at the same depth as a real one.
- `index.not-concurrent` is gated on the *dialect*, not the adapter id.
  `CONCURRENTLY` is not merely unhelpful on MySQL and SQLite, it is a
  syntax error, so the advice would have been actively wrong.
- `routine.volatile-but-readonly` reads the routine *body*, not its
  definition. Reading the whole definition finds `CREATE` in every
  routine, so the rule never fired at all — which is how it was first
  written.
- Two bugs underneath the rules had to be fixed before any of them could
  be trusted, and both were silent. The tokenizer dropped `!`, so
  `a != 1` tokenized identically to `a = 1` and a rule about equality
  would have fired on its exact opposite. And `SqlDialect` was
  structurally `string`, so every caller type-checked while a hardcoded
  `"postgres"` was passed for every connection.

That list is the actual argument for the discipline. Every one of those
would have produced a confident, specific, wrong gripe — and a wrong
gripe costs more trust than a missing one.

If you find one, [report it](https://github.com/datagripe/datagripe/issues).
That is a bug, and it is treated as one.

## Related

- [The rules](/rules/) — all of them, rendered from the catalogue.
- [Gripe levels](/docs/gripe-levels/) — the four-level dial.
- [Writing a rule](/docs/writing-a-rule/) — what adding one costs.
