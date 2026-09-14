/**
 * Render `site/` into `site/dist/` — datagripe.com, which is now more
 * than one page.
 *
 *   site/content/index.html   the landing page's body, still hand-written
 *   site/content/*.md         the documentation, one file per page
 *   site/*.css, icon, mascot  copied verbatim
 *
 * The header, the navigation and the footer live here rather than in
 * each page, which is the whole reason there is a build at all: the
 * landing page and eight documentation pages cannot be kept in step by
 * hand, and a nav that disagrees with itself is worse than no nav.
 *
 * Deliberately not a static-site generator. This is one file, no theme
 * to override, no plugin API, and the markup it emits is the markup that
 * was already written by hand — which is what keeps the brand intact
 * (docs/brand/brand-system.md) rather than reskinned.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

const siteDir = path.join(import.meta.dir, "..", "..", "site");
const contentDir = path.join(siteDir, "content");
const outDir = path.join(siteDir, "dist");

/** Copied into the output untouched; `icon.svg` and `mascot/` are
 * `bun run sync:brand`'s copies and are not edited here. */
const ASSETS = [
	"style.css",
	"tokens.css",
	"icon.svg",
	"download.js",
	"CNAME",
	"mascot",
];

/**
 * The landing page's meta description. Here rather than in
 * `content/index.html` because that file is markup biome formats, and
 * frontmatter in an .html file is an Astro file as far as it is
 * concerned.
 */
const LANDING_DESCRIPTION =
	"A database IDE for PostgreSQL, MySQL, SQLite and Redis. It reads your queries and your schema, and tells you what is wrong with them.";

interface Heading {
	id: string;
	text: string;
}

interface Page {
	/** URL path, always with a trailing slash: `/`, `/docs/keyboard/`. */
	url: string;
	/** Where it is written, relative to the output directory. */
	file: string;
	title: string;
	description: string;
	/** Sidebar grouping; absent for the landing page. */
	group?: string;
	order: number;
	body: string;
	headings: Heading[];
}

/**
 * Frontmatter, in the only shape this site uses: `key: value` lines
 * between `---` fences. A YAML parser would buy nothing and would invite
 * documentation that needs one.
 */
function frontmatter(source: string): {
	data: Record<string, string>;
	body: string;
} {
	const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
	if (match === null) {
		return { data: {}, body: source };
	}
	const data: Record<string, string> = {};
	for (const line of (match[1] as string).split("\n")) {
		const pair = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
		if (pair !== null) {
			data[pair[1] as string] = (pair[2] as string).trim();
		}
	}
	return { data, body: source.slice(match[0].length) };
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/<[^>]+>/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Anchors on every `h2` and `h3`, added after rendering rather than
 * through a custom renderer: the ids are wanted in two places — the
 * markup and the in-page contents list — and a regex over the output
 * gives both without depending on which renderer signature this version
 * of marked happens to have.
 */
function anchor(html: string): { html: string; headings: Heading[] } {
	const headings: Heading[] = [];
	const anchored = html.replace(
		/<h([23])>(.*?)<\/h\1>/g,
		(_full, level: string, inner: string) => {
			const id = slugify(inner);
			if (level === "2") {
				headings.push({ id, text: inner.replace(/<[^>]+>/g, "") });
			}
			return `<h${level} id="${id}"><a class="anchor" href="#${id}">${inner}</a></h${level}>`;
		},
	);
	return { html: anchored, headings };
}

/**
 * The landing page tints its shell comments by hand, so the rendered
 * pages do the same rather than growing a syntax highlighter for the one
 * token that carries meaning. A `#` only starts a comment at the start
 * of a line or after whitespace, which is enough to keep it off `#{`
 * in a connection string.
 */
function tintComments(html: string): string {
	return html.replace(
		/<pre><code(?: class="[^"]*")?>([\s\S]*?)<\/code><\/pre>/g,
		(_full, code: string) =>
			`<pre>${code.replace(/(^|\s)(#[^\n]*)/g, '$1<span class="c">$2</span>')}</pre>`,
	);
}

/**
 * A two-column table whose columns need no names still needs a header
 * row to be a table in markdown. Drop it rather than style around it —
 * an empty row with a rule under it reads as a mistake.
 */
function dropEmptyHead(html: string): string {
	return html.replace(
		/<thead>\s*<tr>\s*(?:<th[^>]*>\s*<\/th>\s*)+<\/tr>\s*<\/thead>/g,
		"",
	);
}

function nav(pages: Page[], current: Page): string {
	const groups = new Map<string, Page[]>();
	for (const page of pages) {
		if (page.group === undefined) {
			continue;
		}
		const existing = groups.get(page.group);
		if (existing === undefined) {
			groups.set(page.group, [page]);
		} else {
			existing.push(page);
		}
	}
	const sections: string[] = [];
	for (const [group, members] of groups) {
		const items = members
			.sort((a, b) => a.order - b.order)
			.map((page) => {
				const active = page.url === current.url;
				const link = `<a href="${page.url}"${active ? ' aria-current="page"' : ""}>${escapeHtml(page.title)}</a>`;
				// The current page's own sections, nested under it: a reader
				// looking for one shortcut should not have to scroll to find
				// out whether this is even the right page.
				const contents =
					active && page.headings.length > 1
						? `<ul class="on-page">${page.headings
								.map(
									(heading) =>
										`<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`,
								)
								.join("")}</ul>`
						: "";
				return `<li>${link}${contents}</li>`;
			})
			.join("");
		sections.push(`<h2>${escapeHtml(group)}</h2><ul>${items}</ul>`);
	}
	return sections.join("");
}

function layout(page: Page, pages: Page[]): string {
	const docs = page.group !== undefined;
	const title =
		page.url === "/"
			? "Datagripe — a database IDE that reads your SQL back to you"
			: `${page.title} — Datagripe`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="icon" href="/icon.svg">
<link rel="stylesheet" href="/style.css">
<meta property="og:title" content="${escapeHtml(page.url === "/" ? "Datagripe" : page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://datagripe.com${page.url}">
</head>
<body>

<header>
	<a class="brand" href="/">
		<img src="/icon.svg" alt="">
		<span class="wordmark">data<em>gripe</em></span>
	</a>
	<nav>
		<a href="/docs/"${docs ? ' aria-current="true"' : ""}>Docs</a>
		<a href="https://github.com/datagripe/datagripe">Source</a>
		<a href="https://github.com/datagripe/datagripe/blob/main/CHANGELOG.md">Changelog</a>
	</nav>
</header>

${
	docs
		? `<div class="docs-shell">
<nav class="docs-nav" aria-label="Documentation">${nav(pages, page)}</nav>
<main class="docs-body">
<h1>${escapeHtml(page.title)}</h1>
<p class="lede">${escapeHtml(page.description)}</p>
${page.body}
</main>
</div>`
		: `<main>\n${page.body}\n</main>`
}

<footer>
	<span>Datagripe</span>
	<a href="/docs/">Docs</a>
	<a href="https://github.com/datagripe/datagripe">GitHub</a>
	<a href="https://github.com/datagripe/datagripe/issues">Issues</a>
	<a href="https://github.com/datagripe/datagripe/blob/main/LICENSE">MIT</a>
	<!-- Required on every public surface, and deliberately names nobody:
	     naming a vendor draws the association the line exists to deny
	     (docs/brand/brand-system.md "Parody boundary"). -->
	<span class="spacer">An independent parody. Not affiliated with,
	endorsed by, or connected to any other software vendor.</span>
</footer>
${page.url === "/" ? '\n<script src="/download.js"></script>' : ""}
</body>
</html>
`;
}

/**
 * Every internal link resolves to a page this build produced or a file
 * it copied. A docs site's characteristic failure is a link that rotted
 * three renames ago, and it is cheaper to fail the build than to find
 * out from a reader.
 */
async function checkLinks(pages: Page[]): Promise<void> {
	const known = new Set(pages.map((page) => page.url));
	for (const asset of ASSETS) {
		known.add(`/${asset}`);
	}
	const assetFiles = await readdir(path.join(siteDir, "mascot"));
	for (const file of assetFiles) {
		known.add(`/mascot/${file}`);
	}
	const broken: string[] = [];
	for (const page of pages) {
		for (const match of page.body.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) {
			const target = match[1] as string;
			if (!known.has(target)) {
				broken.push(`${page.url} → ${target}`);
			}
		}
	}
	if (broken.length > 0) {
		throw new Error(
			`site: ${broken.length} broken internal link(s):\n  ${broken.join("\n  ")}`,
		);
	}
}

const pages: Page[] = [];

// The landing page keeps its hand-written markup — mascots, gripe rows
// and a download button are not what markdown is for — and takes only
// the shell from here.
const landing = await readFile(path.join(contentDir, "index.html"), "utf8");
pages.push({
	url: "/",
	file: "index.html",
	title: "Datagripe",
	description: LANDING_DESCRIPTION,
	order: 0,
	body: landing.trim(),
	headings: [],
});

for (const name of (await readdir(contentDir)).sort()) {
	if (!name.endsWith(".md")) {
		continue;
	}
	const { data, body } = frontmatter(
		await readFile(path.join(contentDir, name), "utf8"),
	);
	const slug = name.replace(/\.md$/, "");
	const url = slug === "index" ? "/docs/" : `/docs/${slug}/`;
	const rendered = anchor(
		dropEmptyHead(tintComments(await marked.parse(body))),
	);
	pages.push({
		url,
		file: path.join("docs", slug === "index" ? "" : slug, "index.html"),
		title: data.title ?? slug,
		description: data.description ?? "",
		group: data.group ?? "Documentation",
		order: Number(data.order ?? "100"),
		body: rendered.html,
		headings: rendered.headings,
	});
}

pages.sort((a, b) => a.order - b.order);
await checkLinks(pages);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const asset of ASSETS) {
	await cp(path.join(siteDir, asset), path.join(outDir, asset), {
		recursive: true,
	});
}
for (const page of pages) {
	const file = path.join(outDir, page.file);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, layout(page, pages));
}

console.log(`[site] ${pages.length} pages → ${outDir}`);
