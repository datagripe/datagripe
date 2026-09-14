# site

datagripe.com: a landing page and the documentation.

```
content/index.html   the landing page's body, hand-written markup
content/*.md         one documentation page each, with frontmatter
style.css            including the docs layout
```

`bun run build:site` renders those into `site/dist/` —
`scripts/site/build.ts`, one file. The header, the navigation and the
footer live there rather than in each page, which is the reason there is
a build: a landing page and six documentation pages cannot be kept in
step by hand, and a nav that disagrees with itself is worse than no nav.

It used to say here that there was nothing to build and so nothing to
break in a build. That was true of one page. What replaces it is a build
that **fails on a broken internal link**, which is a docs site's
characteristic rot and is cheaper to catch here than from a reader. CI
runs it on every pull request for that reason alone.

`icon.svg` and `mascot/` are **copies** of `brand/app-icon/icon.svg` and
`brand/mascot/`, written by `bun run sync:brand`; CI fails if they drift.
`tokens.css` is still a hand copy of `docs/brand/tokens.css`.

## Writing a page

Add a markdown file to `content/`. The filename is the URL —
`keyboard.md` becomes `/docs/keyboard/`.

```markdown
---
title: Keyboard shortcuts
description: One sentence; it is the lede and the meta description.
group: Start here
order: 3
---
```

`group` is the sidebar heading, `order` sorts within it. Internal links
are absolute (`/docs/features/`) and are checked.

These pages are for people using DataGripe. `docs/` at the repository
root is for people building it — specs, ADRs and RFCs — and stays there.

## How it deploys

`.github/workflows/pages.yml` builds and publishes to GitHub Pages on
every push to `main` that touches `site/` or the build script, and on
every published release. There is no `gh-pages` branch: Pages serves a
workflow artifact.

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
