/**
 * Render `site/` into `site/dist/` — datagripe.com.
 *
 *   site/content/index.html    the landing page's body, hand-written
 *   site/content/index.md      the landing page for agents
 *   site/content/docs/*.md     one documentation page each
 *   site/*.css, site.js, …     copied verbatim
 *
 * Three of the pages are not written here at all. They are rendered from
 * the repository, because a page that restates something the code
 * already says is a page that will be wrong by the next release:
 *
 *   /rules/                packages/gripes — the catalogue and its wording
 *   /roadmap/              roadmap.md "Gripes about Datagripe"
 *   /docs/release-notes/   CHANGELOG.md
 *   /docs/adapters/        packages/contracts ADAPTER_CAPABILITIES
 *
 * Everything the build knows it can check, it checks, and a failure here
 * is cheaper than a reader finding it: broken internal links, a roadmap
 * line it cannot parse, a duplicate gripe slug, a "planned" rule that
 * has quietly shipped, a nav entry pointing at nothing.
 *
 * Every page is also emitted as Markdown at the same path with `.md`
 * instead of the trailing slash, and indexed in `/llms.txt`. That is not
 * a nicety: half the readers of a tool like this arrive as an agent, and
 * an agent should not have to render a page to read it.
 *
 * Deliberately not a static-site generator. One file, no theme to
 * override, no plugin API, and the markup it emits is the markup that
 * was written by hand — which is what keeps the brand intact
 * (docs/brand/brand-system.md) rather than reskinned.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	ADAPTER_CAPABILITIES,
	type ConnectionAdapter,
} from "@datagripe/contracts";
import { MESSAGES, RULES } from "@datagripe/gripes";
import { marked } from "marked";

const root = path.join(import.meta.dir, "..", "..");
const siteDir = path.join(root, "site");
const contentDir = path.join(siteDir, "content");
const outDir = path.join(siteDir, "dist");

const ORIGIN = "https://datagripe.com";

/** Copied into the output untouched; `icon.svg` and `mascot/` are
 * `bun run sync:brand`'s copies and are not edited here. */
const ASSETS = [
	"style.css",
	"tokens.css",
	"icon.svg",
	"download.js",
	"site.js",
	"CNAME",
	"mascot",
];

/**
 * The three footer columns, which are also the three documentation
 * groups. One field with two uses rather than two fields that disagree:
 * a page's `group` puts it in the sidebar and in the footer, and there
 * is no way to add it to one and forget the other.
 */
const GROUPS = ["Product", "Deploy", "Learn"] as const;
type Group = (typeof GROUPS)[number];

/** Top-level navigation. Checked against the built pages. */
const NAV: Array<{ label: string; href: string }> = [
	{ label: "Features", href: "/docs/features/" },
	{ label: "Rules", href: "/rules/" },
	{ label: "Roadmap", href: "/roadmap/" },
	{ label: "Docs", href: "/docs/" },
	{ label: "Specs", href: "/specs/" },
];

interface Heading {
	id: string;
	text: string;
}

interface Page {
	/** URL path, always with a trailing slash: `/`, `/docs/keyboard/`. */
	url: string;
	title: string;
	description: string;
	/** Sidebar and footer grouping; absent for the landing and docs index. */
	group?: Group;
	order: number;
	/** Rendered HTML body. */
	body: string;
	/** The same page as Markdown, served at `url` minus its slash, `.md`. */
	markdown: string;
	/** `h2`s, for the right-hand contents rail. */
	headings: Heading[];
	/** Landing-style pages get a sticky section bar instead of a rail. */
	spy?: Heading[];
	/** Present on a spec page: it gets the specs rail, not the docs one. */
	spec?: { status: string; phase: string };
	/** Full-width layout with no documentation chrome. */
	wide?: boolean;
	/** Loads the hero canvas and the download button rewriter. */
	landing?: boolean;
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/<[^>]+>/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * A small number as a word, for a headline. "18 rules" in 60px Space
 * Grotesk reads like a spreadsheet; "eighteen rules" reads like a
 * sentence. Only headlines — a filter button stays a numeral, because
 * that is a count and not prose.
 */
const ONES = [
	"zero",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
	"ten",
	"eleven",
	"twelve",
	"thirteen",
	"fourteen",
	"fifteen",
	"sixteen",
	"seventeen",
	"eighteen",
	"nineteen",
];
const TENS = [
	"",
	"",
	"twenty",
	"thirty",
	"forty",
	"fifty",
	"sixty",
	"seventy",
	"eighty",
	"ninety",
];

/** `words`, capitalised — a headline starts with a capital letter even
 * when the word is a number. */
function Words(n: number): string {
	const word = words(n);
	return (word[0] as string).toUpperCase() + word.slice(1);
}

function words(n: number): string {
	if (n < 20) {
		return ONES[n] as string;
	}
	if (n < 100) {
		const unit = n % 10;
		return unit === 0
			? (TENS[Math.floor(n / 10)] as string)
			: `${TENS[Math.floor(n / 10)]}-${ONES[unit]}`;
	}
	return String(n);
}

/** `/docs/faq/` → `/docs/faq.md`; `/` → `/index.md`. */
function markdownUrl(url: string): string {
	return url === "/" ? "/index.md" : `${url.replace(/\/$/, "")}.md`;
}

/** Where a page's `index.html` is written, relative to the output. */
function htmlFile(url: string): string {
	return path.join(url.replace(/^\//, ""), "index.html");
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

/**
 * Anchors on every `h2` and `h3`, added after rendering rather than
 * through a custom renderer: the ids are wanted in two places — the
 * markup and the contents rail — and a regex over the output gives both
 * without depending on which renderer signature this version of marked
 * happens to have.
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

/**
 * Every table in a scroll container. The configuration and keyboard
 * pages have tables whose first column is a `nowrap` identifier — a
 * long environment variable name, a three-key chord — and on a phone
 * that column alone is wider than the screen. Without this the table
 * does not overflow, the *page* does, and every other line on it gets a
 * horizontal scrollbar it did not ask for.
 */
function scrollableTables(html: string): string {
	return html.replace(
		/<table>([\s\S]*?)<\/table>/g,
		'<div class="table-scroll"><table>$1</table></div>',
	);
}

function renderMarkdown(source: string): {
	html: string;
	headings: Heading[];
} {
	return anchor(
		scrollableTables(
			dropEmptyHead(tintComments(marked.parse(source) as string)),
		),
	);
}

/* ------------------------------------------------------------------ */
/* roadmap.md — the gripes Datagripe has about itself                 */
/* ------------------------------------------------------------------ */

const STATUSES = [
	"being written",
	"accepted",
	"unscheduled",
	"unfiled",
	"declined",
] as const;
type Status = (typeof STATUSES)[number];

interface Gripe {
	status: Status;
	/** Absent for planned rules, whose slug is already a rule id. */
	area?: string;
	slug: string;
	text: string;
}

function isStatus(value: string): value is Status {
	return (STATUSES as readonly string[]).includes(value);
}

/**
 * Parse one `- [status] area · slug — text` list under a heading in
 * `roadmap.md`. Every line under the heading must parse: a line this
 * cannot read is a line that would silently vanish from the roadmap
 * page, which is worse than a failed build.
 */
function parseGripes(
	source: string,
	heading: string,
	withArea: boolean,
): Gripe[] {
	const start = source.indexOf(`### ${heading}`);
	if (start < 0) {
		throw new Error(`roadmap.md: no "### ${heading}" section`);
	}
	const rest = source.slice(start + heading.length + 4);
	const end = rest.search(/^#{2,3} /m);
	const block = end < 0 ? rest : rest.slice(0, end);

	const shape = withArea
		? /^- \[([a-z ]+)\] ([a-z-]+) · ([a-z0-9.-]+) — (.+)$/
		: /^- \[([a-z ]+)\] ()([a-z0-9.-]+) — (.+)$/;

	const gripes: Gripe[] = [];
	for (const line of block.split("\n")) {
		if (!line.startsWith("- ")) {
			continue;
		}
		const match = shape.exec(line);
		if (match === null) {
			throw new Error(
				`roadmap.md (${heading}): cannot parse\n  ${line}\n` +
					`expected: - [status] ${withArea ? "area · " : ""}slug — text`,
			);
		}
		const status = match[1] as string;
		if (!isStatus(status)) {
			throw new Error(
				`roadmap.md (${heading}): "${status}" is not one of ${STATUSES.join(", ")}`,
			);
		}
		gripes.push({
			status,
			...(withArea ? { area: match[2] as string } : {}),
			slug: match[3] as string,
			text: match[4] as string,
		});
	}
	if (gripes.length === 0) {
		throw new Error(`roadmap.md: "### ${heading}" has no entries`);
	}
	const seen = new Set<string>();
	for (const gripe of gripes) {
		if (seen.has(gripe.slug)) {
			throw new Error(`roadmap.md (${heading}): duplicate slug ${gripe.slug}`);
		}
		seen.add(gripe.slug);
	}
	return gripes;
}

/** Severity accent a status borrows, so the roadmap reads in the same
 * colour language as a gripe in the editor does. */
const STATUS_CLASS: Record<Status, string> = {
	"being written": "g-blocker",
	accepted: "g-warning",
	unscheduled: "g-none",
	unfiled: "g-none",
	declined: "g-none",
};

const STATUS_TAG: Record<Status, string> = {
	"being written": "t-blocker",
	accepted: "t-warning",
	unscheduled: "t-none",
	unfiled: "t-none",
	declined: "t-none",
};

/** The second cue, because colour alone never carries meaning — and the
 * same three glyphs the editor gutter uses. */
const STATUS_GLYPH: Record<Status, string> = {
	"being written": "▲",
	accepted: "◆",
	unscheduled: "●",
	unfiled: "●",
	declined: "●",
};

/** Filter key, so `data-k` never has to contain a space. */
function statusKey(status: Status): string {
	return status.replace(" ", "-");
}

function gripeCard(gripe: Gripe): string {
	const trail =
		gripe.area === undefined
			? `rule · ${escapeHtml(gripe.slug)}`
			: `${escapeHtml(gripe.area)} · ${escapeHtml(gripe.slug)}`;
	return `<div data-k="${statusKey(gripe.status)}"><div class="gripe ${STATUS_CLASS[gripe.status]}">
<span class="glyph" aria-hidden="true">${STATUS_GLYPH[gripe.status]}</span>
<p>${escapeHtml(gripe.text)}</p>
<p class="meta"><span class="tag ${STATUS_TAG[gripe.status]}">${gripe.status}</span>${trail}</p>
</div></div>`;
}

function filterBar(
	id: string,
	counts: Map<Status, number>,
	total: number,
): string {
	const buttons = [
		`<button aria-pressed="true" data-k="all">All ${total}</button>`,
	];
	for (const status of STATUSES) {
		const count = counts.get(status) ?? 0;
		if (count === 0) {
			continue;
		}
		buttons.push(
			`<button aria-pressed="false" data-k="${statusKey(status)}">${status} <span class="n">${count}</span></button>`,
		);
	}
	return `<div class="filters" id="${id}">${buttons.join("")}</div>`;
}

function countByStatus(gripes: Gripe[]): Map<Status, number> {
	const counts = new Map<Status, number>();
	for (const gripe of gripes) {
		counts.set(gripe.status, (counts.get(gripe.status) ?? 0) + 1);
	}
	return counts;
}

function roadmapPage(product: Gripe[], planned: Gripe[]): Page {
	const total = product.length;
	const counts = countByStatus(product);

	const body = `<div class="shell sec">
<div class="sec-head split">
<div><p class="meta">Roadmap</p>
<h1>Gripes about Datagripe</h1>
<p class="lede">It has opinions about your schema. These are the ones it has about itself — ${total} of them, rendered from <a href="https://github.com/datagripe/datagripe/blob/main/roadmap.md">roadmap.md</a> in the repository, so this page cannot quietly disagree with the project. Nothing here is a promise, and the declined ones stay on the page because the reason something was refused is the useful part.</p></div>
<img class="mascot" src="/mascot/oh-my.svg" alt="" width="514" height="534">
</div>
${filterBar("gfil", counts, total)}
<div class="lat c2" id="glist">
${product.map(gripeCard).join("\n")}
</div>

<h2 id="rules-not-built-yet"><a class="anchor" href="#rules-not-built-yet">Rules not built yet</a></h2>
<p class="lede">Rule ids that are written down and not implemented. The build fails if one of these has quietly shipped and is still listed here, which is the only way a "planned" list stays true.</p>
<div class="lat c2">
${planned.map(gripeCard).join("\n")}
</div>

<p class="after">The phase log — what shipped when, and what it cost — is <a href="https://github.com/datagripe/datagripe/blob/main/roadmap.md">the rest of that file</a>. What has already shipped is in the <a href="/docs/release-notes/">release notes</a>.</p>
</div>`;

	const markdown = [
		"# Gripes about Datagripe",
		"",
		"It has opinions about your schema. These are the ones it has about",
		"itself. Rendered from `roadmap.md` in the repository. Nothing here is a",
		"promise, and declined items stay on the list because the reason",
		"something was refused is the useful part.",
		"",
		"## About itself",
		"",
		...product.map(
			(gripe) =>
				`- **[${gripe.status}]** \`${gripe.area} · ${gripe.slug}\` — ${gripe.text}`,
		),
		"",
		"## Rules not built yet",
		"",
		...planned.map(
			(gripe) => `- **[${gripe.status}]** \`${gripe.slug}\` — ${gripe.text}`,
		),
		"",
		"See also: [rules that exist](/rules.md), [release notes](/docs/release-notes.md).",
		"",
	].join("\n");

	return {
		url: "/roadmap/",
		title: "Roadmap",
		description: `The ${total} gripes Datagripe has about itself, rendered from the repository's own roadmap.`,
		group: "Product",
		order: 3,
		body,
		markdown,
		headings: [{ id: "rules-not-built-yet", text: "Rules not built yet" }],
		wide: true,
	};
}

/* ------------------------------------------------------------------ */
/* packages/gripes — the rule catalogue                               */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER = { blocker: 0, warning: 1, style: 2 } as const;

/**
 * A rule's primary input, for the filter row. Better than filtering on
 * the id's subject: `inputs` is what decides where a rule runs and what
 * it can know, so "needs the schema" and "reads an object" are questions
 * a reader might actually have. The id's subject is just a noun.
 */
function inputOf(rule: { inputs: readonly string[] }): string {
	return rule.inputs.includes("access")
		? "access"
		: rule.inputs.includes("object")
			? "object"
			: rule.inputs.includes("schema")
				? "schema"
				: "statement";
}

/**
 * A rule's dialect, where it has one. Only stated where it is true and
 * load-bearing: `index.not-concurrent` is gated on the dialect because
 * `CONCURRENTLY` is a syntax error elsewhere, and the access rules only
 * run against an engine with an access report.
 */
function dialectOf(id: string): string {
	if (id === "index.not-concurrent" || id.startsWith("grant.")) {
		return "postgres";
	}
	return "all engines";
}

function rulesPage(planned: Gripe[]): Page {
	const rules = [...RULES].sort(
		(a, b) =>
			SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
			a.id.localeCompare(b.id),
	);

	const missing = rules.filter((rule) => MESSAGES[rule.id] === undefined);
	if (missing.length > 0) {
		throw new Error(
			`site: rules with no wording: ${missing.map((r) => r.id).join(", ")}`,
		);
	}

	// A "planned" rule that has shipped is the drift this page exists to
	// stop. Fail rather than print a rule twice under two headings.
	const shipped = new Set(RULES.map((rule) => rule.id));
	const stale = planned.filter((gripe) => shipped.has(gripe.slug));
	if (stale.length > 0) {
		throw new Error(
			`roadmap.md "Rules not built yet": ${stale
				.map((g) => g.slug)
				.join(
					", ",
				)} already ${stale.length === 1 ? "exists" : "exist"} in the catalogue`,
		);
	}

	const counts = new Map<string, number>();
	for (const rule of rules) {
		counts.set(rule.severity, (counts.get(rule.severity) ?? 0) + 1);
	}
	const inputs = [...new Set(rules.map((rule) => inputOf(rule)))].sort();

	const filters = [
		`<button aria-pressed="true" data-k="all">All ${rules.length}</button>`,
		...(["blocker", "warning", "style"] as const).map(
			(severity) =>
				`<button aria-pressed="false" data-k="${severity}">${severity} <span class="n">${counts.get(severity) ?? 0}</span></button>`,
		),
		...inputs.map(
			(input) =>
				`<button aria-pressed="false" data-k="i-${input}">needs ${input}</button>`,
		),
	].join("");

	const rows = rules
		.map((rule) => {
			const wording = MESSAGES[rule.id];
			return `<div class="rule-row" data-k="${rule.severity} i-${inputOf(rule)}">
<p class="slug">${escapeHtml(rule.id)}</p>
<p class="why">${escapeHtml(wording?.warning ?? "")}</p>
<p class="meta"><span class="tag t-${rule.severity}">${rule.severity}</span>${escapeHtml(rule.inputs.join(" + "))} · ${dialectOf(rule.id)}</p>
</div>`;
		})
		.join("\n");

	const body = `<div class="shell sec">
<div class="sec-head split">
<div><p class="meta">Rules</p>
<h1>${Words(rules.length)} rules, none of them about formatting</h1>
<p class="lede">A rule earns its place by knowing something the query text does not say, or by being about damage rather than tidiness. Style filler is a formatter's job, and the fastest way to get the whole thing switched off. This page is rendered from <code>packages/gripes</code> — the catalogue, the severities and the wording below are the ones the app runs, not a copy of them.</p></div>
<img class="mascot" src="/mascot/shouting.svg" alt="" width="566" height="522">
</div>
<div class="filters" id="rfil">${filters}</div>
<div class="rules" id="rlist">
${rows}
</div>
<p class="after">Each line is the finding at <strong>warning</strong>, the default. The same finding is re-worded at four levels — see <a href="/docs/gripe-levels/">gripe levels</a>. Every one of them is <a href="/docs/dismissing-gripes/">dismissable</a>, and <a href="/docs/writing-a-rule/">a new one</a> is a file, an entry, four strings and three fixtures. The ones that are written down and not built are on the <a href="/roadmap/">roadmap</a>.</p>
</div>`;

	const markdown = [
		`# ${rules.length} rules`,
		"",
		"Rendered from `packages/gripes`. Each line is the finding at",
		"`warning`, the default of four attitude levels; the technical content",
		"is the same at every level and only the register changes.",
		"",
		"| Rule | Severity | Needs | Engines | At warning |",
		"| --- | --- | --- | --- | --- |",
		...rules.map((rule) => {
			const text = (MESSAGES[rule.id]?.warning ?? "").replace(/\|/g, "\\|");
			return `| \`${rule.id}\` | ${rule.severity} | ${rule.inputs.join(", ")} | ${dialectOf(rule.id)} | ${text} |`;
		}),
		"",
		"## Not built yet",
		"",
		...planned.map((gripe) => `- \`${gripe.slug}\` — ${gripe.text}`),
		"",
		"See also: [gripe levels](/docs/gripe-levels.md), [dismissing gripes](/docs/dismissing-gripes.md), [writing a rule](/docs/writing-a-rule.md).",
		"",
	].join("\n");

	return {
		url: "/rules/",
		title: "Rules",
		description: `The ${rules.length} things Datagripe complains about, rendered from the catalogue the app actually runs.`,
		group: "Product",
		order: 2,
		body,
		markdown,
		headings: [],
		wide: true,
	};
}

/* ------------------------------------------------------------------ */
/* CHANGELOG.md — release notes                                       */
/* ------------------------------------------------------------------ */

/**
 * The changelog verbatim, minus its title. Rendered rather than linked
 * because a release note is documentation and belongs on the site an
 * agent can read, and copied rather than summarised because a summary of
 * a changelog is a second changelog.
 */
async function releaseNotesPage(): Promise<Page> {
	const source = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
	const body = source.replace(/^# .*\n/, "").trim();
	const rendered = renderMarkdown(body);
	const intro =
		"Every release, newest first. This is `CHANGELOG.md` from the repository, rendered — there is no second copy of it to fall behind.\n\n";
	return {
		url: "/docs/release-notes/",
		title: "Release notes",
		description:
			"Every release, newest first, from the repository's changelog.",
		group: "Learn",
		order: 6,
		body: rendered.html,
		markdown: `# Release notes\n\n${intro}${body}\n`,
		headings: rendered.headings,
	};
}

/* ------------------------------------------------------------------ */
/* docs/spec — the specifications                                     */
/* ------------------------------------------------------------------ */

const specDir = path.join(root, "docs", "spec");

/**
 * Where a repository path that is not a spec should point. Specs link to
 * each other on this site; everything else still goes to GitHub, because
 * publishing the whole `docs/` tree is a different decision from
 * publishing the specs and has not been made.
 */
const REPO_BLOB = "https://github.com/datagripe/datagripe/blob/main";

interface Spec {
	slug: string;
	/** `Access report` — the `Spec — ` prefix is chrome, not a title. */
	title: string;
	status: string;
	phase: string;
	/** Everything after the metadata block. */
	body: string;
	/** First sentence of "## Goal", for the lede and the index. */
	goal: string;
}

/**
 * Read one spec. Every one of the eighteen has the same four things in
 * the same order — an h1, a `**Status:**`, a `**Phase:**` and a
 * `## Goal` — so this insists on all four rather than coping. A spec
 * that has grown a different shape is worth knowing about at build time;
 * silently publishing it with an empty status is not.
 */
async function readSpec(name: string): Promise<Spec> {
	const slug = name.replace(/\.md$/, "");
	const source = await readFile(path.join(specDir, name), "utf8");

	const heading = /^#\s+(?:Spec\s+—\s+)?(.+)$/m.exec(source);
	const status = /^\*\*Status:\*\*\s*(.+)$/m.exec(source);
	const phase = /^\*\*Phase:\*\*\s*(.+)$/m.exec(source);
	if (heading === null || status === null || phase === null) {
		throw new Error(
			`docs/spec/${name}: expected an "# Spec — …" heading with **Status:** and **Phase:** under it`,
		);
	}

	// The goal's first sentence is the page description. Specs carry no
	// frontmatter and are not going to grow any for the website's benefit.
	const goalSection = /^## Goal\n+([\s\S]*?)(?=\n## )/m.exec(source);
	if (goalSection === null) {
		throw new Error(`docs/spec/${name}: no "## Goal" section`);
	}
	const goalText = (goalSection[1] as string)
		.split("\n\n")[0]
		?.replace(/\s+/g, " ")
		.trim();
	if (goalText === undefined || goalText.length === 0) {
		throw new Error(`docs/spec/${name}: "## Goal" is empty`);
	}
	const sentence = /^(.+?\.)(?:\s|$)/.exec(goalText);
	const goal = (sentence?.[1] ?? goalText).replace(/[`*]/g, "");

	// Drop the h1 and the metadata block; both are re-rendered by the
	// layout, and leaving them in prints the title twice.
	const body = source
		.slice(source.indexOf(phase[0]) + (phase[0] as string).length)
		.replace(/^(\*\*Supersedes:\*\*[\s\S]*?)(?=\n\n)/, "")
		.trim();

	return {
		slug,
		title: heading[1] as string,
		status: status[1] as string,
		phase: phase[1] as string,
		body,
		goal,
	};
}

/**
 * Specs reference each other as backticked paths — ``docs/spec/domains.md``,
 * eighty-eight times across the set — and never as links, because in a
 * repository the path *is* the link. On a website it is a dead end, so
 * every one that names a spec becomes a link to that spec's page, and
 * every one that names anything else becomes a link to GitHub.
 *
 * Done on the rendered HTML rather than the markdown so it applies to
 * exactly the inline-code spans marked's parser produced, and not to an
 * identical run of characters inside a fenced block.
 */
function linkRepoPaths(html: string, slugs: Set<string>): string {
	return html.replace(
		/<code>(docs\/[A-Za-z0-9._/-]+\.md)<\/code>/g,
		(_full, repoPath: string) => {
			const spec = /^docs\/spec\/([a-z0-9-]+)\.md$/.exec(repoPath);
			if (spec !== null && slugs.has(spec[1] as string)) {
				return `<a href="/specs/${spec[1]}/"><code>${repoPath}</code></a>`;
			}
			return `<a href="${REPO_BLOB}/${repoPath}"><code>${repoPath}</code></a>`;
		},
	);
}

/** The same rewrite for the Markdown twin, where the link is real
 * markdown and the target is the twin rather than the page. */
function linkRepoPathsMarkdown(source: string, slugs: Set<string>): string {
	return source.replace(
		/`(docs\/[A-Za-z0-9._/-]+\.md)`/g,
		(_full, repoPath: string) => {
			const spec = /^docs\/spec\/([a-z0-9-]+)\.md$/.exec(repoPath);
			if (spec !== null && slugs.has(spec[1] as string)) {
				return `[\`${repoPath}\`](/specs/${spec[1]}.md)`;
			}
			return `[\`${repoPath}\`](${REPO_BLOB}/${repoPath})`;
		},
	);
}

/**
 * The note at the top of every spec page.
 *
 * These are engineering documents written for whoever builds the thing,
 * and publishing them does not make them user documentation. Saying so
 * once, on every page, is cheaper than a reader working it out from the
 * tone halfway down and cheaper still than them following a design
 * decision as if it were an instruction.
 */
const SPEC_NOTE = `<div class="callout">
<p><strong>This is an engineering document.</strong> Specs are written
for people building DataGripe: they record what a subsystem does and why
the alternatives were rejected, and some of them describe things that are
not built yet. If you are using DataGripe, <a href="/docs/">the
documentation</a> is the place to be — it is maintained for you and this
is not.</p>
</div>`;

function specPage(spec: Spec, slugs: Set<string>): Page {
	const rendered = renderMarkdown(spec.body);
	const meta = `<dl class="spec-meta">
<div><dt>Status</dt><dd>${escapeHtml(spec.status.replace(/[`*]/g, ""))}</dd></div>
<div><dt>Phase</dt><dd>${escapeHtml(spec.phase.replace(/[`*]/g, ""))}</dd></div>
<div><dt>Source</dt><dd><a href="${REPO_BLOB}/docs/spec/${spec.slug}.md">docs/spec/${spec.slug}.md</a></dd></div>
</dl>`;

	return {
		url: `/specs/${spec.slug}/`,
		title: spec.title,
		description: spec.goal,
		spec: { status: spec.status, phase: spec.phase },
		order: 0,
		body: `${meta}\n${SPEC_NOTE}\n${linkRepoPaths(rendered.html, slugs)}`,
		markdown: [
			`# Spec — ${spec.title}`,
			"",
			`**Status:** ${spec.status}`,
			`**Phase:** ${spec.phase}`,
			`**Source:** ${REPO_BLOB}/docs/spec/${spec.slug}.md`,
			"",
			"> An engineering document, not user documentation. It records what",
			"> a subsystem does and why the alternatives were rejected, and some",
			"> of it describes things that are not built. For using DataGripe,",
			"> read [the documentation](/docs.md) instead.",
			"",
			linkRepoPathsMarkdown(spec.body, slugs),
			"",
		].join("\n"),
		headings: rendered.headings,
	};
}

/** `current`, `draft — …`, `superseded by …` → the word that groups it. */
function statusGroup(status: string): string {
	const first = status.toLowerCase().trim();
	if (first.startsWith("current")) {
		return "Current";
	}
	if (first.startsWith("draft")) {
		return "Draft";
	}
	return "Other";
}

const SPEC_GROUPS = ["Current", "Draft", "Other"] as const;

function specsIndexPage(specs: Spec[]): Page {
	const byGroup = new Map<string, Spec[]>();
	for (const spec of specs) {
		const group = statusGroup(spec.status);
		byGroup.set(group, [...(byGroup.get(group) ?? []), spec]);
	}

	const sections: string[] = [];
	for (const group of SPEC_GROUPS) {
		const members = byGroup.get(group);
		if (members === undefined) {
			continue;
		}
		const cards = members
			.map(
				(
					spec,
				) => `<div><h3><a href="/specs/${spec.slug}/">${escapeHtml(spec.title)}</a></h3>
<p>${escapeHtml(spec.goal)}</p>
<p class="meta">phase ${escapeHtml(spec.phase.replace(/[`*]/g, ""))} · ${escapeHtml(spec.status.replace(/[`*]/g, ""))}</p></div>`,
			)
			.join("\n");
		sections.push(
			`<h2 id="${slugify(group)}"><a class="anchor" href="#${slugify(group)}">${group}</a></h2>\n<div class="lat c2">\n${cards}\n</div>`,
		);
	}

	const body = `<div class="shell sec">
<div class="sec-head split">
<div><p class="meta">Specifications</p>
<h1>How it is built, and why</h1>
<p class="lede">${specs.length} specifications, rendered from <a href="${REPO_BLOB}/docs/spec">docs/spec</a> in the repository. Each one records what a subsystem does, what it deliberately does not, and which alternatives were rejected and for what reason — that last part is usually the useful bit and it is almost never in the code.</p></div>
<img class="mascot" src="/mascot/shocked.svg" alt="" width="566" height="550">
</div>
${SPEC_NOTE}
${sections.join("\n")}
<p class="after">Architecture decisions live in <a href="${REPO_BLOB}/docs/adr">docs/adr</a>, and the phase log is <a href="${REPO_BLOB}/roadmap.md">roadmap.md</a> — whose second half is the <a href="/roadmap/">roadmap page</a>.</p>
</div>`;

	const markdown = [
		"# Specifications",
		"",
		`${specs.length} specifications, rendered from \`docs/spec\` in the repository.`,
		"Each records what a subsystem does, what it deliberately does not, and",
		"which alternatives were rejected and why.",
		"",
		"> Engineering documents, not user documentation. For using DataGripe,",
		"> read [the documentation](/docs.md).",
		"",
		...SPEC_GROUPS.flatMap((group) => {
			const members = byGroup.get(group);
			if (members === undefined) {
				return [];
			}
			return [
				`## ${group}`,
				"",
				...members.map(
					(spec) =>
						`- [${spec.title}](/specs/${spec.slug}.md) — ${spec.goal} *(phase ${spec.phase.replace(/[`*]/g, "")})*`,
				),
				"",
			];
		}),
	].join("\n");

	return {
		url: "/specs/",
		title: "Specifications",
		description: `${specs.length} engineering specifications, rendered from the repository — what each subsystem does and which alternatives were rejected.`,
		order: 0,
		body,
		markdown,
		headings: SPEC_GROUPS.filter((group) => byGroup.has(group)).map(
			(group) => ({ id: slugify(group), text: group }),
		),
		wide: true,
	};
}

/* ------------------------------------------------------------------ */
/* ADAPTER_CAPABILITIES — the adapters table                          */
/* ------------------------------------------------------------------ */

const ADAPTER_LABEL: Record<ConnectionAdapter, string> = {
	postgres: "PostgreSQL",
	mysql: "MySQL",
	sqlite: "SQLite",
	redis: "Redis",
};

function yesNo(value: boolean): string {
	return value ? "yes" : "—";
}

/**
 * The capability matrix as markdown, substituted into
 * `docs/adapters.md` wherever it says `{{adapters}}`. Generated because
 * this table is the one piece of documentation guaranteed to be wrong
 * the day an adapter gains a capability, and `ADAPTER_CAPABILITIES` is
 * already the single source of truth the app itself gates on.
 */
function adapterTable(): string {
	const adapters = Object.keys(ADAPTER_CAPABILITIES) as ConnectionAdapter[];
	const rows: Array<[string, (a: ConnectionAdapter) => string]> = [
		["SQL dialect", (a) => ADAPTER_CAPABILITIES[a].sqlDialect ?? "none"],
		["Explorer", (a) => ADAPTER_CAPABILITIES[a].introspection ?? "—"],
		["Execution", (a) => ADAPTER_CAPABILITIES[a].execution ?? "—"],
		["Cancellation", (a) => yesNo(ADAPTER_CAPABILITIES[a].cancellation)],
		["Table view", (a) => ADAPTER_CAPABILITIES[a].tableData ?? "—"],
		[
			"Column changes",
			(a) => {
				const kinds = ADAPTER_CAPABILITIES[a].columnChanges;
				if (kinds.length === 0) {
					return "—";
				}
				return kinds.length === 7 ? "all seven" : kinds.join(", ");
			},
		],
		["Access report", (a) => yesNo(ADAPTER_CAPABILITIES[a].accessReport)],
		["Default port", (a) => String(ADAPTER_CAPABILITIES[a].defaultPort ?? "—")],
		["`database` means", (a) => ADAPTER_CAPABILITIES[a].databaseLabel],
	];
	const head = `| | ${adapters.map((a) => ADAPTER_LABEL[a]).join(" | ")} |`;
	const rule = `| --- | ${adapters.map(() => "---").join(" | ")} |`;
	const lines = rows.map(
		([label, read]) =>
			`| ${label} | ${adapters.map((a) => read(a)).join(" | ")} |`,
	);
	return [head, rule, ...lines].join("\n");
}

/* ------------------------------------------------------------------ */
/* layout                                                             */
/* ------------------------------------------------------------------ */

function footerColumn(group: Group, pages: Page[]): string {
	const items = pages
		.filter((page) => page.group === group)
		.sort((a, b) => a.order - b.order)
		.map((page) => `<a href="${page.url}">${escapeHtml(page.title)}</a>`)
		.join("");
	return `<div><h2>${group}</h2>${items}</div>`;
}

/**
 * The navigation for a railed page, as data: a heading for the whole
 * set and then one area per group.
 *
 * Built once and rendered twice — down the left rail on a wide screen,
 * and inside the dropdown in the section bar on a narrow one. Two
 * renderers over one list rather than two lists, because a sidebar and
 * a menu that disagree about what exists is the same class of bug as a
 * nav that disagrees with itself.
 */
interface NavArea {
	group: string;
	items: Array<{ url: string; title: string; on: boolean }>;
}

interface RailNav {
	/** The "all of them" link at the top, and the dropdown's label. */
	root: { url: string; title: string; label: string; on: boolean };
	areas: NavArea[];
}

function docsNav(pages: Page[], current: Page): RailNav {
	return {
		root: {
			url: "/docs/",
			title: "All documentation",
			label: "Docs",
			on: current.url === "/docs/",
		},
		areas: GROUPS.map((group) => ({
			group,
			items: pages
				.filter((page) => page.group === group)
				.sort((a, b) => a.order - b.order)
				.map((page) => ({
					url: page.url,
					title: page.title,
					on: page.url === current.url,
				})),
		})),
	};
}

function railMarkup(nav: RailNav): string {
	const sections: string[] = [
		`<a class="all${nav.root.on ? " on" : ""}" href="${nav.root.url}">${escapeHtml(nav.root.title)}</a>`,
	];
	for (const area of nav.areas) {
		if (area.items.length === 0) {
			continue;
		}
		const items = area.items
			.map(
				(item) =>
					`<a href="${item.url}"${item.on ? ' class="on" aria-current="page"' : ""}>${escapeHtml(item.title)}</a>`,
			)
			.join("");
		sections.push(`<p class="grp">${escapeHtml(area.group)}</p>${items}`);
	}
	return sections.join("");
}

/**
 * The rail on a spec page: every spec, grouped by status. Its own rail
 * rather than the documentation's, because a reader deep in the object
 * view spec wants the other seventeen specs beside them, not the
 * deployment guide.
 */
function specsNav(pages: Page[], current: Page): RailNav {
	const specs = pages.filter((page) => page.spec !== undefined);
	return {
		root: {
			url: "/specs/",
			title: "All specifications",
			label: "Specs",
			on: current.url === "/specs/",
		},
		areas: SPEC_GROUPS.map((group) => ({
			group,
			items: specs
				.filter((page) => statusGroup(page.spec?.status ?? "") === group)
				.map((page) => ({
					url: page.url,
					title: page.title,
					on: page.url === current.url,
				})),
		})),
	};
}

function contentsRail(page: Page): string {
	if (page.headings.length < 2) {
		return "";
	}
	const items = page.headings
		.map(
			(heading) => `<a href="#${heading.id}">${escapeHtml(heading.text)}</a>`,
		)
		.join("");
	return `<p class="meta">On this page</p>${items}`;
}

/**
 * The sticky section bar under the header.
 *
 * On the landing page it is the page's own sections. On a documentation
 * or spec page it is that page's headings plus, pinned to the right, a
 * dropdown holding the navigation the left rail shows on a wide screen —
 * because below the rail's breakpoint there is nowhere else for it to
 * go, and twenty-one links stacked above the article is not an answer.
 *
 * The headings scroll horizontally and the dropdown does not move with
 * them: what gets cut off when there are too many headings is a heading,
 * never the way out of the page.
 *
 * A `details` element rather than a scripted menu, so it opens with no
 * JavaScript at all. `site.js` only adds closing it by clicking away or
 * pressing Escape, which is an improvement on the baseline rather than
 * the thing that makes it work.
 */
function spyBar(entries: Heading[], nav?: RailNav): string {
	if (entries.length === 0 && nav === undefined) {
		return "";
	}
	const links = entries
		.map(
			(entry, index) =>
				`<a href="#${entry.id}"${index === 0 ? ' class="on"' : ""}>${escapeHtml(entry.text)}</a>`,
		)
		.join("");

	const menu =
		nav === undefined
			? ""
			: `<details class="spy-menu">
<summary>${escapeHtml(nav.root.label)}</summary>
<div class="spy-panel">${railMarkup(nav)}</div>
</details>`;

	// `spy-rails` marks the bar as the narrow-screen stand-in for the two
	// rails, so the stylesheet can drop it once they are on screen. The
	// landing page's bar has no rails behind it and stays at every width.
	return `<div class="spy${nav === undefined ? "" : " spy-rails"}"><div class="shell in">
<div class="spy-links">${links}</div>
${menu}
</div></div>`;
}

function layout(page: Page, pages: Page[]): string {
	const isSpec = page.spec !== undefined || page.url === "/specs/";
	// The two-rail shell, used by the documentation and the specs alike.
	// The landing page and the lattice pages opt out with `wide`.
	const railed = page.wide !== true && page.url !== "/";
	const title =
		page.url === "/"
			? "Datagripe — a database IDE that reads your SQL back to you"
			: `${page.title} — Datagripe`;
	const navLinks = NAV.map((item) => {
		const on =
			item.href === page.url ||
			(item.href === "/docs/" && railed && !isSpec) ||
			(item.href === "/specs/" && isSpec && page.url !== "/specs/");
		return `<a href="${item.href}"${on ? ' aria-current="page"' : ""}>${item.label}</a>`;
	}).join("");

	const nav = railed
		? isSpec
			? specsNav(pages, page)
			: docsNav(pages, page)
		: undefined;

	const main =
		railed && nav !== undefined
			? `${spyBar(page.headings.length > 1 ? page.headings : [], nav)}
<div class="shell wide"><div class="docs">
<nav class="docs-rail" aria-label="${isSpec ? "Specifications" : "Documentation"}">${railMarkup(nav)}</nav>
<article class="docs-body">
<h1>${escapeHtml(page.title)}</h1>
<p class="lede">${escapeHtml(page.description)}</p>
${page.body}
<p class="md-foot">This page as <a href="${markdownUrl(page.url)}">Markdown</a>, for an agent or a diff.</p>
</article>
<nav class="docs-toc" aria-label="On this page">${contentsRail(page)}</nav>
</div></div>`
			: `${spyBar(page.spy ?? [])}\n${page.body}`;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="icon" href="/icon.svg">
<link rel="stylesheet" href="/style.css">
<link rel="canonical" href="${ORIGIN}${page.url}">
<!-- Half the readers of a tool like this arrive as an agent. The
     Markdown twin is a first-class representation, not an export. -->
<link rel="alternate" type="text/markdown" href="${markdownUrl(page.url)}" title="This page as Markdown">
<meta property="og:title" content="${escapeHtml(page.url === "/" ? "Datagripe" : page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${ORIGIN}${page.url}">
</head>
<body${page.landing === true ? ' data-landing="true"' : ""}>

<a class="skip" href="#main">Skip to content</a>

<header id="hdr">
<!-- The brand edge, static. Motion in Datagripe means the database is
     busy; on the marketing site there is no database, so the rule holds
     and the bar holds still (docs/brand/brand-system.md "Motion"). -->
<div class="dg-abar is-idle" aria-hidden="true"><div class="dg-abar__colour"></div></div>
<div class="shell bar">
	<!-- The prompt lockup, the same one the application wears
	     (brand-system.md "The prompt"): the chevron in magenta, Data in
	     ink, gripe in green, in the mono face. The classes and their
	     colours are tokens.css untouched, so the site's wordmark and the
	     app's are one definition rather than two that agree today.

	     No project tail: that half of the prompt carries project
	     identity and a website has no project, so the stable half is the
	     whole lockup here. -->
	<a class="logo" href="/"><span class="dg-prompt__gt">&gt;</span><span class="dg-prompt__brand">Data<b>gripe</b></span></a>
	<nav class="main" aria-label="Main">${navLinks}<a href="https://github.com/datagripe/datagripe">Source</a></nav>
	<div class="right">
		<a class="md-chip" href="${markdownUrl(page.url)}"><b>.md</b> for agents</a>
		<button class="burger" id="burger" aria-expanded="false" aria-controls="drawer">menu</button>
	</div>
</div>
<div class="shell"><div id="drawer">${navLinks}<a href="https://github.com/datagripe/datagripe">Source</a><a href="${markdownUrl(page.url)}">This page as Markdown</a></div></div>
</header>

<main id="main">
${main}
</main>

<footer>
<div class="shell">
	<div class="fcols">
		${GROUPS.map((group) => footerColumn(group, pages)).join("\n\t\t")}
		<div>
			<h2>Agents</h2>
			<a href="/llms.txt">llms.txt</a>
			<a href="/llms-full.txt">llms-full.txt</a>
			<a href="${markdownUrl(page.url)}">This page as Markdown</a>
			<a href="/sitemap.xml">sitemap.xml</a>
			<h2 class="second">Project</h2>
			<a href="/specs/">Specifications</a>
			<a href="https://github.com/datagripe/datagripe">Source</a>
			<a href="/docs/release-notes/">Changelog</a>
			<a href="https://github.com/datagripe/datagripe/issues">Issues</a>
			<a href="https://github.com/datagripe/datagripe/blob/main/LICENSE">MIT licence</a>
		</div>
	</div>
	<div class="fbase">
		<!-- Required on every public surface, and deliberately names nobody:
		     naming a vendor draws the association the line exists to deny
		     (docs/brand/brand-system.md "Parody boundary"). -->
		<p>An independent parody. Not affiliated with, endorsed by, or
		connected to any other software vendor.</p>
		<p class="meta">Every page here is also Markdown. Append <code>.md</code> to the path.</p>
	</div>
</div>
</footer>

<script src="/site.js" defer></script>
${page.landing === true ? '<script src="/download.js" defer></script>' : ""}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* checks                                                             */
/* ------------------------------------------------------------------ */

/**
 * Every internal link resolves to a page this build produced or a file
 * it copied. A docs site's characteristic failure is a link that rotted
 * three renames ago, and it is cheaper to fail the build than to find
 * out from a reader.
 *
 * The Markdown twins are checked with the same set, which is the only
 * thing keeping them from becoming a second, worse site: a relative link
 * in a `.md` that points at nothing is exactly as broken, and rather
 * more annoying to whatever followed it.
 */
async function checkLinks(pages: Page[]): Promise<void> {
	const known = new Set<string>();
	for (const page of pages) {
		known.add(page.url);
		known.add(markdownUrl(page.url));
	}
	for (const asset of ASSETS) {
		known.add(`/${asset}`);
	}
	for (const file of await readdir(path.join(siteDir, "mascot"))) {
		known.add(`/mascot/${file}`);
	}
	for (const generated of ["/llms.txt", "/llms-full.txt", "/sitemap.xml"]) {
		known.add(generated);
	}

	const broken: string[] = [];
	const check = (from: string, target: string): void => {
		if (!known.has(target)) {
			broken.push(`${from} → ${target}`);
		}
	};
	for (const page of pages) {
		for (const match of page.body.matchAll(
			/(?:href|src)="(\/[^"#]*)(#[^"]*)?"/g,
		)) {
			check(page.url, match[1] as string);
		}
		for (const match of page.markdown.matchAll(
			/]\((\/[^)#\s]*)(#[^)\s]*)?\)/g,
		)) {
			check(markdownUrl(page.url), match[1] as string);
		}
	}

	// The header nav is written here, not in a page, so nothing else would
	// notice it pointing at a page that was renamed.
	for (const item of NAV) {
		check("nav", item.href);
	}

	if (broken.length > 0) {
		throw new Error(
			`site: ${broken.length} broken internal link(s):\n  ${broken.join("\n  ")}`,
		);
	}
}

/**
 * No page ships a placeholder nothing replaced. `counts()` throws on a
 * name it does not know, so this catches the other direction: a page
 * that was never passed through it at all, which is what happens when
 * somebody adds a third kind of page and forgets.
 */
function checkPlaceholders(pages: Page[]): void {
	const left: string[] = [];
	for (const page of pages) {
		for (const source of [page.body, page.markdown]) {
			for (const match of source.matchAll(/<!--dg:\w+-->|{{\w+}}/g)) {
				left.push(`${page.url} → ${match[0]}`);
			}
		}
	}
	if (left.length > 0) {
		throw new Error(
			`site: ${left.length} unsubstituted placeholder(s):\n  ${left.join("\n  ")}`,
		);
	}
}

/** Every page has a group, so it appears in the footer and the rail —
 * an orphan page is one nothing links to. */
function checkGrouping(pages: Page[]): void {
	// Specs are reachable from the nav, the specs rail and the specs
	// index, so they need no group. Everything else does, or nothing
	// links to it.
	const orphans = pages.filter(
		(page) =>
			page.group === undefined &&
			page.spec === undefined &&
			page.url !== "/" &&
			page.url !== "/docs/" &&
			page.url !== "/specs/",
	);
	if (orphans.length > 0) {
		throw new Error(
			`site: page(s) with no group, so nothing links to them: ${orphans
				.map((page) => page.url)
				.join(", ")}`,
		);
	}
	const seen = new Map<string, string>();
	for (const page of pages) {
		const key = `${page.group}/${page.order}`;
		if (page.group !== undefined) {
			const other = seen.get(key);
			if (other !== undefined) {
				throw new Error(
					`site: ${page.url} and ${other} are both ${page.group} order ${page.order}`,
				);
			}
			seen.set(key, page.url);
		}
	}
}

/* ------------------------------------------------------------------ */
/* agent surfaces                                                     */
/* ------------------------------------------------------------------ */

/**
 * `/llms.txt` — the whole site as one index, in the shape agents expect:
 * a title, one line of what this is, then links with a sentence each.
 * Generated from the same page list the nav is, so it cannot list a page
 * that does not exist or miss one that does.
 */
function llmsTxt(pages: Page[]): string {
	const lines = [
		"# Datagripe",
		"",
		"> A database IDE for PostgreSQL, MySQL, SQLite and Redis that reads your",
		"> queries and your schema back to you and says what is wrong with them.",
		"> Free and open source, MIT. Runs on your own machine with one command,",
		"> or as one container for a team.",
		"",
		"Every page below is Markdown. The HTML version is the same path without",
		"the `.md`. `/llms-full.txt` is all of it in one file.",
		"",
	];
	const landing = pages.find((page) => page.url === "/");
	const docsIndex = pages.find((page) => page.url === "/docs/");
	lines.push("## Start");
	lines.push("");
	for (const page of [landing, docsIndex]) {
		if (page !== undefined) {
			lines.push(
				`- [${page.title}](${markdownUrl(page.url)}): ${page.description}`,
			);
		}
	}
	lines.push("");
	for (const group of GROUPS) {
		lines.push(`## ${group}`);
		lines.push("");
		for (const page of pages
			.filter((page) => page.group === group)
			.sort((a, b) => a.order - b.order)) {
			lines.push(
				`- [${page.title}](${markdownUrl(page.url)}): ${page.description}`,
			);
		}
		lines.push("");
	}
	// Specs go under Optional, which is what llms.txt reserves for context
	// a reader can skip: they are engineering documents, and an agent
	// answering "how do I deploy this" should not be reading them first.
	lines.push("## Optional");
	lines.push("");
	const specsIndex = pages.find((page) => page.url === "/specs/");
	if (specsIndex !== undefined) {
		lines.push(
			`- [${specsIndex.title}](${markdownUrl(specsIndex.url)}): ${specsIndex.description}`,
		);
	}
	for (const page of pages.filter((page) => page.spec !== undefined)) {
		lines.push(
			`- [Spec — ${page.title}](${markdownUrl(page.url)}): ${page.description}`,
		);
	}
	lines.push(
		"- [Source](https://github.com/datagripe/datagripe): the repository these pages are rendered from.",
	);
	lines.push("");
	return lines.join("\n");
}

/** Every page's Markdown, concatenated, for a client that would rather
 * make one request than twenty-three. */
function llmsFullTxt(pages: Page[]): string {
	const parts = [
		"# Datagripe — the whole site",
		"",
		`Generated ${new Date().toISOString().slice(0, 10)} from ${ORIGIN}.`,
		"Every page, in reading order. Individual pages are at the same paths",
		"with `.md`; `/llms.txt` is the index.",
		"",
	];
	for (const page of pages) {
		parts.push("---");
		parts.push("");
		parts.push(`<!-- ${ORIGIN}${page.url} -->`);
		parts.push("");
		parts.push(page.markdown.trim());
		parts.push("");
	}
	return parts.join("\n");
}

function sitemapXml(pages: Page[]): string {
	const urls = pages
		.map(
			(page) =>
				`\t<url><loc>${ORIGIN}${page.url}</loc><priority>${page.url === "/" ? "1.0" : "0.7"}</priority></url>`,
		)
		.join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/* ------------------------------------------------------------------ */
/* build                                                              */
/* ------------------------------------------------------------------ */

/**
 * The released version, for the Helm examples. Two pages said
 * `--version 0.0.6` on the day 0.0.7 shipped, which is the same failure
 * as "eleven rules" and gets the same treatment.
 */
const VERSION = (
	JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
		version: string;
	}
).version;

const roadmapSource = await readFile(path.join(root, "roadmap.md"), "utf8");
const productGripes = parseGripes(roadmapSource, "About itself", true);
const plannedRules = parseGripes(roadmapSource, "Rules not built yet", false);

/** Read up front rather than beside the pages they become: the spec
 * count is a substitutable placeholder, so `counts()` needs this before
 * the first page renders. */
const specs = await Promise.all(
	(await readdir(specDir))
		.filter((name) => name.endsWith(".md"))
		.sort()
		.map(readSpec),
);
if (specs.length === 0) {
	throw new Error("site: docs/spec is empty");
}
const specSlugs = new Set(specs.map((spec) => spec.slug));

const pages: Page[] = [];

/**
 * The landing page keeps its hand-written markup — mascots, a lattice of
 * gripe cards and a canvas are not what markdown is for — and takes only
 * the shell from here. Its section ids and their labels come from
 * `data-spy` on the sections themselves, so the sticky bar cannot list a
 * section that was renamed or dropped.
 *
 * `index.md` beside it is the landing page for an agent, written rather
 * than converted: what an agent wants from this page is the claim and
 * the links, not a transcript of a particle animation.
 */
const landingHtml = await readFile(path.join(contentDir, "index.html"), "utf8");
const landingMd = await readFile(path.join(contentDir, "index.md"), "utf8");
const spy: Heading[] = [
	...landingHtml.matchAll(/id="([^"]+)"[^>]*data-spy="([^"]+)"/g),
].map((match) => ({ id: match[1] as string, text: match[2] as string }));
if (spy.length === 0) {
	throw new Error("site: index.html has no data-spy sections for the nav bar");
}
/**
 * Counts the landing page would otherwise state and be wrong about
 * within two releases — it said "eleven rules" in three places on the
 * day the catalogue reached eighteen.
 *
 * The markup form is an HTML comment rather than `{{…}}`: the landing
 * page is real HTML that biome formats, and a brace expression in it is
 * a template language as far as biome is concerned. `index.md` uses the
 * same spelling so there is one syntax to remember.
 */
const COUNTS: Record<string, () => string> = {
	ruleCount: () => String(RULES.length),
	ruleCountWord: () => words(RULES.length),
	ruleCountWordCap: () => Words(RULES.length),
	plannedCount: () => String(plannedRules.length),
	plannedCountWord: () => words(plannedRules.length),
	specCount: () => String(specs.length),
	specCountWord: () => words(specs.length),
	version: () => VERSION,
};

function counts(source: string): string {
	return source.replace(/<!--dg:(\w+)-->/g, (full, name: string) => {
		const read = COUNTS[name];
		if (read === undefined) {
			throw new Error(`site: no value for the placeholder ${full}`);
		}
		return read();
	});
}

const landingBody = counts(landingHtml.trim());

pages.push({
	url: "/",
	title: "Datagripe",
	description:
		"A database IDE for PostgreSQL, MySQL, SQLite and Redis. It reads your queries and your schema, and tells you what is wrong with them.",
	order: 0,
	body: landingBody,
	markdown: counts(landingMd),
	headings: [],
	spy,
	wide: true,
	landing: true,
});

for (const name of (await readdir(path.join(contentDir, "docs"))).sort()) {
	if (!name.endsWith(".md")) {
		continue;
	}
	const slug = name.replace(/\.md$/, "");
	const raw = await readFile(path.join(contentDir, "docs", name), "utf8");
	const { data, body } = frontmatter(raw);
	const substituted = counts(body).replace("{{adapters}}", adapterTable());
	const rendered = renderMarkdown(substituted);
	const url = slug === "index" ? "/docs/" : `/docs/${slug}/`;
	const group = data.group;
	if (
		slug !== "index" &&
		(group === undefined || !GROUPS.includes(group as Group))
	) {
		throw new Error(
			`site: ${name} has group "${group ?? ""}"; expected one of ${GROUPS.join(", ")}`,
		);
	}
	pages.push({
		url,
		title: data.title ?? slug,
		description: data.description ?? "",
		...(slug === "index" ? {} : { group: group as Group }),
		order: Number(data.order ?? "100"),
		body: rendered.html,
		markdown: `# ${data.title ?? slug}\n\n${substituted.trim()}\n`,
		headings: rendered.headings,
	});
}

pages.push(specsIndexPage(specs));
for (const spec of specs) {
	pages.push(specPage(spec, specSlugs));
}

pages.push(rulesPage(plannedRules));
pages.push(roadmapPage(productGripes, plannedRules));
pages.push(await releaseNotesPage());

// Reading order: the landing, the documentation index, then each group
// in nav order. `/llms-full.txt` is concatenated in this order, and so
// is the sitemap.
const groupRank = (page: Page): number =>
	page.url === "/"
		? -2
		: page.url === "/docs/"
			? -1
			: page.url === "/specs/"
				? GROUPS.length
				: page.spec !== undefined
					? GROUPS.length + 1
					: GROUPS.indexOf(page.group as Group);
pages.sort((a, b) => groupRank(a) - groupRank(b) || a.order - b.order);

checkGrouping(pages);
checkPlaceholders(pages);
await checkLinks(pages);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const asset of ASSETS) {
	await cp(path.join(siteDir, asset), path.join(outDir, asset), {
		recursive: true,
	});
}

for (const page of pages) {
	const html = path.join(outDir, htmlFile(page.url));
	await mkdir(path.dirname(html), { recursive: true });
	await writeFile(html, layout(page, pages));

	const md = path.join(outDir, markdownUrl(page.url).replace(/^\//, ""));
	await mkdir(path.dirname(md), { recursive: true });
	await writeFile(md, page.markdown);
}

await writeFile(path.join(outDir, "llms.txt"), llmsTxt(pages));
await writeFile(path.join(outDir, "llms-full.txt"), llmsFullTxt(pages));
await writeFile(path.join(outDir, "sitemap.xml"), sitemapXml(pages));
await writeFile(
	path.join(outDir, "robots.txt"),
	`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`,
);

console.log(
	`[site] ${pages.length} pages (+${pages.length} markdown) → ${outDir}`,
);
console.log(
	`[site] ${RULES.length} rules, ${productGripes.length} gripes, ${plannedRules.length} planned rules, ${specs.length} specs`,
);
