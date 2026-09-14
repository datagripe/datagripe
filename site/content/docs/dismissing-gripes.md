---
title: Dismissing gripes
description: Three scopes, never silently, and why an occurrence dismissal cannot key on a line number.
group: Learn
order: 3
---

Every gripe is dismissable, at every attitude level, always. A tool that
argues with you about something you have already decided is a tool you
switch off, and a switched-off tool catches nothing.

## Three scopes

The labels say what they mean rather than what they are called
internally:

| What you click | Scope | Keyed on |
| --- | --- | --- |
| **not here** | occurrence | rule id + this statement |
| **not in this file** (or **not on this object**) | target | rule id + document or object |
| **never in this project** | project | rule id |

Dismissing the same thing twice is a no-op rather than an error.

## It is never silent

This is the part that matters more than the scopes. A dismissal that
quietly made the tool show you less would be a way to make it lie.

- The gripes panel keeps a **count of what is hidden**, with a **show all
  again** beside it.
- A dismissed finding leaves the gutter and the annotation rail as well
  as the panel. Silencing the panel while a squiggle continued to argue
  with it would be worse than not dismissing at all.
- Findings stay in the store either way, so restoring them costs no
  re-analysis.

## Why an occurrence is not a line number

An occurrence dismissal keys on a hash of the statement's normalized
text, not on its position in the document. Offsets move the moment
anything above them is typed, so an offset-keyed dismissal would
evaporate on the next keystroke.

Hashing the statement gets the behaviour right in both directions, which
is the actual argument for it:

- Editing an unrelated statement — or running the formatter over the
  whole file — **keeps** the dismissal. Nothing about your statement
  changed.
- Editing *this* statement **drops** it. The finding may no longer hold
  once the text changed, and re-deciding is cheap while a stale
  suppression is not.

## Where a dismissal lives

Server-side, per workspace, so it survives a browser and a machine.

It is currently **team-wide**: a schema finding is a team fact, and
having four people each dismiss the same missing primary key is four
people doing the same work. That is still an open question, so
`dismissed_by` is recorded on every row — which is enough to make
dismissals personal later without losing the history of who decided
what.

One wrinkle worth knowing: a local scratchpad's dismissal references a
document id the server does not otherwise know about. It is harmless,
and it is why a dismissal made in a scratchpad follows that scratchpad
rather than appearing against a shared file.

## Before you dismiss it

If the gripe is wrong — not unwanted, *wrong* — that is a bug and it is
worth more than a dismissal.
[Report it](https://github.com/datagripe/datagripe/issues). A wrong gripe
costs more trust than a missing one, and the catalogue has a test class
for exactly this: every rule carries a fixture that *looks* like the
finding and is not, because that is where a false positive comes from.

If it is right but you do not care about it in this project, dismiss it
at project scope and move on. That is what the scope is for.

## Related

- [Why it complains](/docs/why-it-complains/) — correctness over coverage.
- [Gripe levels](/docs/gripe-levels/) — turning the volume down instead.
- [The rules](/rules/) — what each id means.
