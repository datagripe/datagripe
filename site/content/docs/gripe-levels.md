---
title: Gripe levels
description: Four levels of rudeness over one set of findings, and the three rules that keep panic a joke.
group: Product
order: 4
---

The attitude level decides how a finding is phrased. It does not decide
what was found. Turning the dial re-words what is already on screen and
never re-runs the analysis, which is why it is instant and why it cannot
change the answer.

The four levels are PostgreSQL severities, on purpose.

## The same finding, four ways

One rule — `join.no-condition` — at each level. The technical content is
identical in all four; only the register moves.

| Level | |
| --- | --- |
| `notice` | This join has no condition. That is a cross product. |
| `warning` | This join has no condition. I'll allow it. I won't forget it. |
| `fatal` | No join condition. You've asked for every row times every row. Absolute state of this. |
| `panic` | NO JOIN CONDITION. Every row. Times every row. I want you to sit and think about what that number is. |

`notice` is dry and still critical — it is the level for a shared screen,
and it is guaranteed profanity-free by a test. `warning` is the default.
`fatal` swears. `panic` is a joke and is written as one.

## Severity is not attitude

These are two independent axes and conflating them is the failure mode
the whole design is arranged against.

- **Severity** is how bad the finding is: `blocker`, `warning`, `style`.
  It comes from the rule and never moves.
- **Attitude** is how rudely it is phrased. It comes from your setting
  and never changes what was found.

A `style` finding rendered at `fatal` swears about something trivial,
which is exactly the waste to avoid — a gripe that swears at a redundant
index has spent the currency for nothing. The engine does not couple the
two axes; the message catalogue is where that judgment is made, per rule,
by whoever wrote the four strings.

## Setting it

Resolution order, first hit wins:

1. **A session override**, set as a real statement in the editor:

   ```sql
   set datagripe.attitude = 'notice';
   ```

   It is a statement rather than a setting so it can be dropped in
   before a screen share without opening a settings dialog. It lives for
   the session.

2. **The project setting.**
3. **`warning`**, if neither of the above says otherwise.

## The three rules about panic

All three exist so that the joke stays a joke:

- **It can never be the default.**
- **It cannot be set for an organisation** — only by the person reading
  it, for their own session or their own project. Nobody gets to make
  `panic` happen to somebody else.
- **It resets on upgrade.** The app version is stored alongside the
  setting; if the version has changed and the level is `panic`, it drops
  to `warning`. A joke that cannot be escaped is not a joke.

## What is behind the dial

A finding carries facts, not sentences — `{ rows: 41203882, column:
"status" }`, never `"41M rows and no index on status"`. That is the
whole reason attitude is a presentation layer rather than four parallel
analyses:

| Stage | Produces | Depends on attitude |
| --- | --- | --- |
| Evaluate | a finding: rule id, severity, location, facts | no |
| Render | one sentence | yes |

Two consequences worth naming. The server never sends prose, because it
would have to know the reader's attitude and attitude is a per-reader
setting. And the rule id in the footer is the same string at every level,
so a gripe you screenshot at `panic` and a gripe you dismiss at `notice`
are provably the same gripe.

## A caveat, and it is current

Attitude and project class live in your browser's `localStorage` today.
A per-project attitude the server has never heard of is really a
per-browser attitude: two machines, two personalities. Moving both into
the workspace model is one migration and it is being written — it is on
the [roadmap](/roadmap/) as `config · settings-server-side`, and it is
the same thing blocking the object view's danger zone.

## Related

- [Why it complains](/docs/why-it-complains/) — the reasoning underneath.
- [The rules](/rules/) — each one at `warning`.
- [Dismissing gripes](/docs/dismissing-gripes/) — turning one off.
