# AGENTS.md

Conventions for anyone — human or agent — making a change in this
repository. [README.md](README.md) is how to run it; this is how to
leave it.

## The one rule that is easy to forget

**A change to behaviour is a change to datagripe.com, in the same
commit.**

The website is not marketing that trails the product by a release. It is
the user documentation, it is what an agent reads instead of the source,
and it is the first thing anybody sees. A site describing a version that
no longer exists is worse than no site, because it is confidently wrong.

So: before you finish, ask what a reader of the site would now be told
that is no longer true. If the answer is "nothing", say so in the commit
message rather than assuming it.

### What is already automatic

Five things are rendered from the repository and cannot drift. Change
the source and the site follows on the next build — do **not** write a
second copy of any of them into `site/content/`:

| Site page | Rendered from |
| --- | --- |
| `/rules/` | `packages/gripes` — `RULES` and `MESSAGES` |
| `/roadmap/` | `roadmap.md`, "Gripes about Datagripe" |
| `/specs/` and `/specs/<slug>/` | `docs/spec/*.md`, verbatim |
| `/docs/release-notes/` | `CHANGELOG.md` |
| `/docs/adapters/` capability table | `packages/contracts` — `ADAPTER_CAPABILITIES` |

Counts and the version are substituted at build time for the same
reason. Write `<!--dg:ruleCount-->` or `<!--dg:version-->` in any page
rather than the value; the available names are in `COUNTS` in the build,
an unknown one fails the build, and so does a placeholder on a page
nothing substituted.

Two worked examples of why. Three places on this site said "eleven
rules" on the day the catalogue reached eighteen. Two more said
`--version 0.0.6` on the day 0.0.7 shipped. Neither is the kind of thing
a reviewer catches.

`bun run build:site` fails rather than publishes when any of this is
inconsistent: a broken internal link, a roadmap line it cannot parse, a
duplicate gripe slug, a page with no group, a placeholder nothing
substitutes, a spec missing its status, phase or goal, or a rule listed
as "not built yet" that has quietly shipped. CI runs it on every pull
request.

### What is not automatic

Prose. If you changed something a page describes in words, edit the page.
The likely candidates, by what you touched:

| You changed | Check |
| --- | --- |
| a keybinding | `site/content/docs/keyboard.md` |
| an environment variable | `site/content/docs/configuration.md`, and `.env.example` |
| anything about deployment | `docs/{deploy,docker,compose,kubernetes,upgrading}.md` under `site/content/` |
| a security default or switch | `site/content/docs/security.md` |
| a feature's surface | `site/content/docs/features.md` |
| how gripes are rendered, scoped or dismissed | `site/content/docs/{gripe-levels,dismissing-gripes,why-it-complains}.md` |
| an adapter's behaviour beyond its capability flags | `site/content/docs/adapters.md` |
| a new term users will meet | `site/content/docs/glossary.md` |
| a question you had to answer twice | `site/content/docs/faq.md` |

Adding a page means one markdown file in `site/content/docs/` with
`title`, `description`, `group` (`Product`, `Deploy` or `Learn`) and
`order`. The group puts it in the sidebar *and* the footer — there is no
way to add it to one and forget the other, and a page with no group
fails the build rather than becoming an orphan.

## Keeping the roadmap honest

`roadmap.md` has two machine-read sections, `### About itself` and
`### Rules not built yet`. They are the roadmap page. The format is
strict and the build says so when it is broken:

```
- [status] area · slug — the gripe, in one or two sentences.
```

Status is `being written`, `accepted`, `unscheduled`, `unfiled` or
`declined`. Write them in DataGripe's own voice — it complains about
your schema, so it complains about itself the same way.

Two habits that matter more than the format:

- **Finishing something means moving its gripe, not deleting it.** A
  gripe that is fixed goes in the CHANGELOG and comes off the list. A
  gripe that turned out to be wrong gets `declined` and a sentence
  saying why.
- **Declined entries stay.** The reason something was refused is the
  most useful thing on that page, and deleting it means answering the
  same question again in six months.

## Documentation in the repository

`docs/` is for people building DataGripe; `site/` is for people using
it. Both are updated in the same change as the behaviour they describe —
see [docs/README.md](docs/README.md).

**`docs/spec/` is published.** Every spec is rendered to `/specs/<slug>/`
on datagripe.com, with a Markdown twin, so a spec is now a public page
and not only a file in a repository. Nothing about how they are written
changes — but a spec left saying "planned" about something that shipped
last month is now visibly wrong to a reader rather than quietly wrong to
a contributor.

The build reads four things out of every spec and fails if any is
missing: an `# Spec — Title` heading, a `**Status:**` line, a
`**Phase:**` line, and a `## Goal` section whose first sentence becomes
the page's description. Keep that shape.

## Brand

[`docs/brand/brand-system.md`](docs/brand/brand-system.md) is binding,
not advisory. Two rules catch people out:

- **Colour alone never carries meaning.** Every severity, status or
  category coded by colour also carries an icon, a dash pattern or a
  text label. The four accents sit at similar lightness on purpose.
- **Motion means the database is busy.** Nothing else animates. The one
  exception is the landing page's hero canvas, which is a joke about
  that rule and is argued for by name in the brand spec — a second
  exception would mean the rule is wrong, not that the budget grew.

The site imports `tokens.css` and every colour in `site/style.css` is a
`var()`. Keep it that way: it is what stops the site and the app from
drifting apart.

`brand/` is the only place brand assets are edited. `bun run sync:brand`
copies them into `apps/` and `site/`; `bun run check:brand` fails on
drift and CI runs it.

## Writing gripes

If you add a rule, you write four strings — one per attitude level — in
`packages/gripes/src/messages.ts`, with no fallback. `assertions.ts`
enforces the mechanical half: length caps, barred terms at every level,
`notice` profanity-free, every placeholder resolving, and the id shape.

What no test checks is whether the sentence is any good. The calibration
to write against is `join.no-condition`, which is quoted verbatim from
the brand spec and is deliberately not paraphrased or improved.

A rule also needs three fixtures, and the third is the one that earns its
place: a case that **looks like the finding and is not**. Every false
positive this catalogue would have shipped was caught by that fixture
class. See
[`site/content/docs/writing-a-rule.md`](site/content/docs/writing-a-rule.md)
for the full account, and `docs/spec/gripes.md` — published at
`/specs/gripes/` — for the specification.

Rule ids are a public contract. Renaming one silently un-dismisses it
for every user, so a rule that changes meaning gets a new id.

## Commands

```bash
bun install
bun run dev              # web on :5173, api on :3001
bun test
bun run typecheck
bun run lint             # biome; lint:fix to write
bun run build:site       # site/dist, and the checks above
bun run check:brand      # fails if a brand copy has drifted
bun run db:migrate
```

Run `typecheck`, `test`, `lint` and `build:site` before calling a change
done. CI runs all four and nothing else will catch a broken site link.

## Style

Tabs, as biome is configured. `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess` are on, so an optional property is omitted
rather than set to `undefined`, and an index access is checked.

Comments explain *why*, and particularly why an obvious alternative was
rejected. The existing files are the reference: they are written for
somebody who will wonder, in a year, what the constraint was. Match that
density rather than adding a comment per line or none at all.
