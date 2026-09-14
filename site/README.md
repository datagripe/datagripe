# site

datagripe.com: the landing page and the user documentation.

```
content/index.html        the landing page's body, hand-written markup
content/index.md          the landing page for an agent, hand-written prose
content/docs/*.md         one documentation page each, with frontmatter
style.css                 everything, bound to tokens.css
site.js                   header, drawer, filters, scrollspy, hero canvas
```

`bun run build:site` renders those into `site/dist/` —
`scripts/site/build.ts`, one file. The header, the navigation and the
footer live there rather than in each page, which is the reason there is
a build: twenty-three pages cannot be kept in step by hand, and a nav
that disagrees with itself is worse than no nav.

Deliberately not a static-site generator. No theme to override, no
plugin API, and the markup it emits is the markup that was written by
hand — which is what keeps the brand intact rather than reskinned.

## Four pages nobody writes

These are rendered from the repository. Do not write a second copy of
any of them into `content/`:

| Page | From |
| --- | --- |
| `/rules/` | `packages/gripes` — `RULES` and `MESSAGES` |
| `/roadmap/` | `roadmap.md`, "Gripes about Datagripe" |
| `/docs/release-notes/` | `CHANGELOG.md` |
| `/docs/adapters/` capability table | `ADAPTER_CAPABILITIES`, via `{{adapters}}` |

The landing page's rule counts are substituted too — `{{ruleCount}}`,
`{{plannedCount}}`, and `{{ruleCountWord}}` / `{{ruleCountWordCap}}` for
the spelled-out forms a headline wants.

This is not gold-plating. This site said "eleven rules" in three places
on the day the catalogue reached eighteen, which is how a number goes
stale everywhere at once, and is exactly the drift a build can prevent
and a reviewer cannot.

## What the build refuses to publish

It used to say here that there was nothing to build and so nothing to
break in a build. That was true of one page. What replaces it is a build
that fails, rather than publishes, on:

- a broken internal link — a docs site's characteristic rot, and cheaper
  to catch here than from a reader. Both the HTML and the Markdown twins
  are checked against the same set;
- a nav entry pointing at a page that no longer exists;
- a page with no `group`, which is a page nothing links to;
- two pages claiming the same group and order;
- a line in `roadmap.md`'s gripe sections it cannot parse, a duplicate
  slug, or a status outside the five;
- **a rule listed as "not built yet" that has quietly shipped**;
- a rule in the catalogue with no wording;
- a `{{placeholder}}` on the landing page that nothing substitutes;
- an `index.html` with no `data-spy` sections for the section bar.

CI runs it on every pull request for that reason alone.

## Writing a page

Add a markdown file to `content/docs/`. The filename is the URL —
`keyboard.md` becomes `/docs/keyboard/`.

```markdown
---
title: Keyboard shortcuts
description: One sentence; it is the lede and the meta description.
group: Product
order: 6
---
```

`group` is one of **Product**, **Deploy** or **Learn**, and it does two
jobs: it is the sidebar heading and it is the footer column. One field
with two uses rather than two fields that disagree — there is no way to
add a page to the sidebar and forget the footer.

`order` sorts within the group. Internal links are absolute
(`/docs/features/`) and are checked.

These pages are for people using DataGripe. `docs/` at the repository
root is for people building it — specs, ADRs and RFCs — and stays there.

## Markdown, for agents

Every page is written twice: `/docs/faq/` as HTML, and `/docs/faq.md` as
the same page in Markdown. The rule is "drop the trailing slash, add
`.md`", so the landing page is `/index.md` and the docs index is
`/docs.md`.

Also emitted: `/llms.txt` (the whole site indexed, one sentence per
page), `/llms-full.txt` (all of it in one request), `/sitemap.xml` and
`/robots.txt`. Every page carries
`<link rel="alternate" type="text/markdown">` and a `.md for agents` chip
in the header.

This is a first-class representation rather than an export. Half the
readers of a tool like this arrive as an agent, and an agent should not
have to render a page to read it.

The one page written twice by hand is the landing page: `index.html` and
`index.md` are separate files. That is deliberate. What the landing page
has that the Markdown does not is a particle animation making fun of
particle animations, and a faithful transcript of it would help nobody —
so `index.md` is the claim and the links, which is what an agent came
for. It is the only place on the site where two files can drift, and the
trade was made knowingly.

## The hero canvas

The one moving thing on any Datagripe surface that is not the activity
bar. It is a joke about hero canvases, its readout reports its own
relevance as `0.00%`, and the brand rule it suspends is argued for by
name in `docs/brand/brand-system.md` "Motion" — read that before adding
a second one.

It stops drifting under `prefers-reduced-motion`. Nothing else on the
site animates: the brand edge under the header is rendered `is-idle` on
every page, because motion means the database is busy and there is no
database here.

## Assets

`icon.svg` and `mascot/` are **copies** of `brand/app-icon/icon.svg` and
`brand/mascot/`, written by `bun run sync:brand`; CI fails if they drift.
`tokens.css` is still a hand copy of `docs/brand/tokens.css`.

Every colour in `style.css` is a `var()` from `tokens.css`. The literals
in it are geometry. That is what stops the site and the application from
drifting apart on colour or type, and it is worth keeping.

## How it deploys

`.github/workflows/pages.yml` builds and publishes to GitHub Pages on
every push to `main` that touches `site/` or the build script, and on
every published release. There is no `gh-pages` branch: Pages serves a
workflow artifact.

Because four pages are now rendered from the repository, the workflow
also has to run when *those* change — a release that adds a rule changes
`/rules/` without touching `site/`.

One-time setup: **Settings → Pages → Source = "GitHub Actions"**.

## Custom domain

`CNAME` does **not** claim the domain. For Actions-based Pages the file
only preserves a domain that is already set, so all three of these are
needed and in this order:

1. DNS pointing at GitHub (below).
2. The domain set on the Pages site itself —
   `gh api -X PUT repos/OWNER/REPO/pages -f cname=datagripe.com`, or
   Settings → Pages → Custom domain.
3. A **re-deploy**. The domain does not bind to the existing
   deployment; until the workflow runs again, GitHub answers "Site not
   found" for a domain it does not yet associate with this repo.

Skipping (2) and (3) looks exactly like broken DNS, which is the wrong
place to go looking.

For the apex domain, four A records:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

and, if the registrar supports AAAA:

```
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
```

Plus a CNAME for `www` → `datagripe.github.io`, which GitHub
redirects to the apex. Then tick **Enforce HTTPS** (or
`-F https_enforced=true`); the certificate is usually issued within
minutes of the domain verifying, and enforcement cannot be set before
it exists.

## Downloads

`download.js` asks the GitHub API for the latest release and rewrites
the button for the visitor's platform. It cannot use GitHub's fixed
`/releases/latest/download/<name>` redirect because the asset filenames
carry their version — which is worth keeping, since a file in a
downloads folder should say what it is.

The markup ships pointing at the releases page, so the page still works
with no JavaScript, a rate-limited API, or a failed request.
