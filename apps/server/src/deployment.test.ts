import { beforeEach, describe, expect, test } from "bun:test";
import type { AppConfig } from "./config";
import {
	checkForUpdate,
	detectShape,
	isNewer,
	isSupervised,
	resetUpdateCache,
} from "./deployment";

const CONFIG = {
	UPDATE_CHECK_DISABLED: false,
	RESTART_TO_UPDATE: undefined,
} as unknown as AppConfig;

function feed(body: unknown, status = 200): typeof fetch {
	return (async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		})) as unknown as typeof fetch;
}

beforeEach(() => resetUpdateCache());

describe("deployment shape", () => {
	test("a pod is Kubernetes, whatever the image called itself", () => {
		expect(
			detectShape({
				KUBERNETES_SERVICE_HOST: "10.0.0.1",
				DATAGRIPE_SHAPE: "container",
			}),
		).toBe("kubernetes");
	});

	test("the desktop shell and the launcher name themselves", () => {
		expect(detectShape({ DATAGRIPE_SHAPE: "desktop" })).toBe("desktop");
		expect(detectShape({ DATAGRIPE_SHAPE: "cli" })).toBe("cli");
	});

	test("a checkout is not pretending to be anything", () => {
		expect(detectShape({})).toBe("source");
	});
});

describe("supervision", () => {
	// The whole point of the restart button: it is only offered where
	// something is going to start the process again.
	test("Kubernetes by default, nothing else", () => {
		expect(isSupervised("kubernetes", { RESTART_TO_UPDATE: undefined })).toBe(
			true,
		);
		expect(isSupervised("container", { RESTART_TO_UPDATE: undefined })).toBe(
			false,
		);
		expect(isSupervised("source", { RESTART_TO_UPDATE: undefined })).toBe(
			false,
		);
	});

	test("a compose stack that restarts can say so, and a pod can say not", () => {
		expect(isSupervised("container", { RESTART_TO_UPDATE: true })).toBe(true);
		expect(isSupervised("kubernetes", { RESTART_TO_UPDATE: false })).toBe(
			false,
		);
	});
});

describe("version comparison", () => {
	test("newer is newer, per component", () => {
		expect(isNewer("0.0.8", "0.0.7")).toBe(true);
		expect(isNewer("0.1.0", "0.0.9")).toBe(true);
		expect(isNewer("1.0.0", "0.9.9")).toBe(true);
		expect(isNewer("v0.0.8", "0.0.7")).toBe(true);
	});

	test("the same version, or an older one, is not an update", () => {
		expect(isNewer("0.0.7", "0.0.7")).toBe(false);
		expect(isNewer("0.0.6", "0.0.7")).toBe(false);
	});

	// A tag nobody expected must read as "nothing to do" rather than as
	// an update that can never be installed.
	test("an unparseable tag is not an update", () => {
		expect(isNewer("nightly", "0.0.7")).toBe(false);
		expect(isNewer("", "0.0.7")).toBe(false);
	});
});

describe("the update check", () => {
	test("reports the release the feed names", async () => {
		const result = await checkForUpdate(CONFIG, {
			fetch: feed({
				tag_name: "v99.0.0",
				html_url: "https://example.test/releases/99",
			}),
		});
		expect(result.latest).toBe("99.0.0");
		expect(result.newer).toBe(true);
		expect(result.url).toBe("https://example.test/releases/99");
		expect(result.error).toBeNull();
	});

	// Silence is not "you are up to date". Saying so on a failed request
	// is how somebody misses a security release.
	test("a failed request is an error, never an all-clear", async () => {
		const result = await checkForUpdate(CONFIG, {
			fetch: (async () => {
				throw new Error("getaddrinfo ENOTFOUND");
			}) as unknown as typeof fetch,
		});
		expect(result.latest).toBeNull();
		expect(result.newer).toBe(false);
		expect(result.error).toBe("Could not reach the release feed.");
	});

	test("a refusal from the feed says what it answered", async () => {
		const result = await checkForUpdate(CONFIG, { fetch: feed({}, 403) });
		expect(result.error).toBe("The release feed answered 403.");
		expect(result.newer).toBe(false);
	});

	test("a second press inside the window is the same answer", async () => {
		let calls = 0;
		const counting = (async () => {
			calls += 1;
			return new Response(JSON.stringify({ tag_name: "v99.0.0" }), {
				status: 200,
			});
		}) as unknown as typeof fetch;
		await checkForUpdate(CONFIG, { fetch: counting });
		await checkForUpdate(CONFIG, { fetch: counting });
		expect(calls).toBe(1);
	});

	test("turned off, it reaches nothing and says why", async () => {
		let called = false;
		const result = await checkForUpdate(
			{ ...CONFIG, UPDATE_CHECK_DISABLED: true } as AppConfig,
			{
				fetch: (async () => {
					called = true;
					return new Response("{}");
				}) as unknown as typeof fetch,
			},
		);
		expect(called).toBe(false);
		expect(result.error).toContain("turned off");
	});
});
