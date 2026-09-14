---
title: Writing a rule
description: A file, an entry, four strings and three fixtures — and the fixture that matters is the one that must not fire.
group: Learn
order: 2
---

A rule is a pure function that declares what it needs. The runner gives
it exactly that and nothing else, which is what lets the same catalogue
run in the browser for the inputs already in memory and on the server for
the inputs that need a connection.

Adding one means four things, and there is no way to do three of them.

## 1. The rule

```ts
interface Rule {
  /** `<subject>.<problem>`, lower-kebab. Stable, and a public contract. */
  id: string;
  severity: "blocker" | "warning" | "style";
  /** What it needs to decide. The runner only calls rules whose
   *  inputs it can supply. */
  inputs: RuleInput[];
  /** Returns nothing when it cannot tell. Never a hedge. */
  evaluate(context: GripeContext): Finding[];
}
```

The inputs are `statement`, `schema`, `object`, `access`, `execution` and
`plan`. A rule declaring `["statement", "schema"]` is never called
without both, so it never has to check.

A finding carries **facts, not sentences**:

```ts
{ ruleId: "column.nullable-inequality",
  severity: "warning",
  at: documentLocation(statement, start, end),
  facts: { column: "status" } }
```

`{ rows: 41203882 }`, never `"41M rows"`. This is what makes attitude a
presentation layer rather than four parallel analyses — see
[gripe levels](/docs/gripe-levels/).

## 2. The entry

One line in `packages/gripes/src/catalogue.ts`. That file is the
catalogue, and the [rules page](/rules/) on this site is rendered from
it — so a rule that is in the code is on the website, and a rule that is
not is not.

## 3. Four strings

One per attitude level, in `messages.ts`, with no fallback. A test
enforces the mechanical half:

- all four present, none missing and none inherited;
- length caps, so a gripe fits where gripes go;
- the barred-term list at every level;
- `notice` is profanity-free;
- every `{placeholder}` resolves against the facts the rule emits;
- the id matches `<subject>.<problem>`.

What no test can check is whether the sentence is any good. These are
copy and they are reviewed like copy. The calibration to write against is
`join.no-condition`, which is quoted verbatim from the brand
specification and is deliberately not paraphrased or improved.

A `style` finding never swears. Spending the currency on a redundant
index is the exact failure the brand spec warns about.

## 4. Three fixtures

One that fires. One that does not. And the one that earns its place:

> **a case that looks like the finding and is not.**

That third class is not a formality. It is where every false positive in
this catalogue would have come from, and each existing rule carries the
one that caught it:

- `delete.no-where` — `create trigger t after delete on x`, which reads
  as an unqualified delete unless you read the statement's main verb
  through a leading `WITH`. Without it the rule fires on every trigger in
  the database.
- `view.select-star` — `select qty * price`, where the `*` sits at
  exactly the same depth as a real projection star. Depth alone is not
  enough; the rule has to look at what surrounds it.
- `index.duplicate` — a **unique** index whose columns prefix a wider
  one. It enforces something the wider index does not, so dropping it
  changes behaviour rather than saving writes. Never flag it.
- `routine.volatile-but-readonly` — a `plpgsql` body, which can write
  through dynamic SQL that no amount of reading will reveal. The rule
  declines to judge it.
- `subquery.not-in` — `NOT EXISTS`, which is the fix, and a written-out
  list, where a null is visible to whoever reads it. Neither fires.

## The id is a contract

A rule id appears in the gripe footer, in dismissal rows, and in whatever
anyone greps their logs for. **Renaming one silently un-dismisses it for
every user.**

So ids are stable, and a rule that changes meaning gets a new id rather
than new behaviour under the old one. This is the same discipline the
engine applies to the wording, for the same reason: the parts users build
habits on do not move.

## Where it runs

The split is by input, not by preference:

- **The browser** runs rules whose inputs are already in memory —
  `statement`, the client's `SchemaInput`, and `object` in the object
  view, where the describe result is the whole input.
- **The server** runs rules needing a connection. `execution` and `plan`
  rules wait on the server-side runner, which is
  [being written](/roadmap/).

The client's `SchemaInput` is honest about the cache behind it:
`isNullable` is real, and `rowsFor` and `indexLeadsWith` always answer
`null` because the completion catalogue carries neither. They are
declared rather than omitted so a rule needing them compiles and stays
quiet.

## Related

- [Why it complains](/docs/why-it-complains/) — what a rule has to earn.
- [The rules](/rules/) — the current catalogue.
- [Roadmap](/roadmap/) — rules written down and not built.
- [The gripes engine spec](/specs/gripes/) — the full design, including
  the parts that are not built.
