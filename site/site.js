/* datagripe.com — the site's whole script.
 *
 * Four things, none of which the page needs to work: the header
 * tightens on scroll, the mobile drawer opens, the filter rows on the
 * rules and roadmap pages hide what you did not ask for, and the
 * section bar highlights where you are. Without any of it every page
 * still renders, every link still resolves, and every filter's contents
 * are still on the page — which is the point, because a documentation
 * site that needs JavaScript to be read is a documentation site an agent
 * cannot read.
 *
 * The hero canvas is the exception and is not defensible on those
 * grounds. It is a joke about hero canvases: the readout beside it
 * counts particles and lines honestly and reports its insights and its
 * relevance at zero, which is the true figure for every animation of
 * this kind ever shipped. See docs/brand/brand-system.md "Motion".
 */
(() => {
	const header = document.getElementById("hdr");
	if (header !== null) {
		addEventListener(
			"scroll",
			() => header.classList.toggle("tight", scrollY > 90),
			{ passive: true },
		);
	}

	const burger = document.getElementById("burger");
	const drawer = document.getElementById("drawer");
	if (burger !== null && drawer !== null) {
		burger.addEventListener("click", () => {
			const open = drawer.classList.toggle("open");
			burger.setAttribute("aria-expanded", String(open));
			burger.textContent = open ? "close" : "menu";
		});
	}

	/* Filters are a display toggle over rows that are all already in the
	   document. Nothing is fetched, nothing is re-sorted, and "All" is the
	   state the page is served in — so a reader with no JavaScript gets
	   the complete list rather than an empty one. */
	function filters(barId, listId, selector) {
		const bar = document.getElementById(barId);
		const list = document.getElementById(listId);
		if (bar === null || list === null) {
			return;
		}
		bar.addEventListener("click", (event) => {
			const button = event.target.closest("button");
			if (button === null) {
				return;
			}
			for (const other of bar.querySelectorAll("button")) {
				other.setAttribute("aria-pressed", String(other === button));
			}
			const key = button.dataset.k;
			for (const row of list.querySelectorAll(selector)) {
				const keys = (row.dataset.k ?? "").split(" ");
				row.hidden = key !== "all" && !keys.includes(key);
			}
		});
	}

	filters("rfil", "rlist", ".rule-row");
	filters("gfil", "glist", "[data-k]");

	/* The section bar and the on-this-page rail mark the heading you are
	   reading. `-68%` on the bottom margin means a heading counts as
	   current once it is in the top third, which is where a reader's eye
	   is — not once it touches the bottom of the window. */
	// `.spy-links` and not `.spy a`: the dropdown beside them holds links
	// to other pages, and passing "/specs/domains/" to querySelector is
	// not a selector — it throws and takes the whole script with it.
	const links = [...document.querySelectorAll(".spy-links a, .docs-toc a")];
	const targets = links
		.map((link) => document.querySelector(link.getAttribute("href")))
		.filter((target) => target !== null);
	if (targets.length > 0) {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) {
						continue;
					}
					for (const link of links) {
						link.classList.toggle(
							"on",
							link.getAttribute("href") === `#${entry.target.id}`,
						);
					}
				}
			},
			{ rootMargin: "-110px 0px -68% 0px", threshold: 0 },
		);
		for (const target of targets) {
			observer.observe(target);
		}
	}

	/* The section bar's dropdown is a `details` element, so it opens and
	   closes on its own. These two only add what `details` has no opinion
	   about: clicking away, and Escape. */
	const menu = document.querySelector(".spy-menu");
	if (menu !== null) {
		addEventListener("click", (event) => {
			if (menu.open && !menu.contains(event.target)) {
				menu.open = false;
			}
		});
		addEventListener("keydown", (event) => {
			if (event.key === "Escape" && menu.open) {
				menu.open = false;
				menu.querySelector("summary")?.focus();
			}
		});
	}

	/* ---- the hero canvas ------------------------------------------- */

	const canvas = document.getElementById("cv");
	if (canvas === null) {
		return;
	}
	const ctx = canvas.getContext("2d");
	const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
	let width = 0;
	let height = 0;
	let level = 1;
	let points = [];

	function seed(count) {
		points = [];
		for (let i = 0; i < count; i++) {
			points.push({
				x: Math.random() * width,
				y: Math.random() * height,
				vx: (Math.random() - 0.5) * 0.5,
				vy: (Math.random() - 0.5) * 0.5,
			});
		}
	}

	function fit() {
		const box = canvas.parentNode.getBoundingClientRect();
		width = box.width;
		height = box.height;
		const ratio = Math.min(devicePixelRatio || 1, 2);
		canvas.width = width * ratio;
		canvas.height = height * ratio;
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		seed(140 * level);
	}

	addEventListener("resize", fit);

	const more = document.getElementById("more");
	const label = document.getElementById("lvl");
	if (more !== null && label !== null) {
		more.addEventListener("click", () => {
			level = level >= 6 ? 1 : level + 1;
			seed(140 * level);
			label.textContent = `Impressiveness: ${level}x${level >= 6 ? " — that is enough" : ""}`;
		});
	}

	const particles = document.getElementById("r-particles");
	const lines = document.getElementById("r-lines");

	// Green for the mesh, magenta for one node in eleven — the two accents
	// that mean "healthy" and "the complaint" everywhere else, doing no
	// work at all here, which is the joke. Read from the tokens rather
	// than written twice: a canvas cannot take a var(), so this is the one
	// place on the site a colour could drift, and it does not.
	const styles = getComputedStyle(document.documentElement);
	const token = (name, fallback) =>
		styles.getPropertyValue(name).trim() || fallback;
	const green = token("--dg-green", "#00E599");
	const magenta = token("--dg-magenta", "#FF3EA5");
	const rgb = [1, 3, 5].map((at) =>
		Number.parseInt(green.slice(at, at + 2), 16),
	);
	const mesh = (alpha) => `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`;

	function frame() {
		ctx.clearRect(0, 0, width, height);
		let drawn = 0;
		for (let i = 0; i < points.length; i++) {
			const a = points[i];
			if (!still) {
				a.x += a.vx;
				a.y += a.vy;
			}
			if (a.x < 0 || a.x > width) {
				a.vx *= -1;
			}
			if (a.y < 0 || a.y > height) {
				a.vy *= -1;
			}
			for (let j = i + 1; j < points.length; j++) {
				const b = points[j];
				const dx = a.x - b.x;
				const dy = a.y - b.y;
				const distance = dx * dx + dy * dy;
				if (distance < 7000) {
					drawn++;
					ctx.strokeStyle = mesh(0.2 - distance / 35000);
					ctx.lineWidth = 0.6;
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.stroke();
				}
			}
			ctx.fillStyle = i % 11 === 0 ? magenta : green;
			ctx.beginPath();
			ctx.arc(a.x, a.y, 1.3, 0, 6.284);
			ctx.fill();
		}
		if (particles !== null) {
			particles.textContent = String(points.length);
		}
		if (lines !== null) {
			lines.textContent = drawn.toLocaleString();
		}
		requestAnimationFrame(frame);
	}

	fit();
	frame();
})();
