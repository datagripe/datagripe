import { existsSync } from "node:fs";
import type {
	AppVersion,
	DeploymentShape,
	UpdateCheck,
} from "@datagripe/contracts";
import { version as serverVersion } from "../package.json";
import type { AppConfig } from "./config";

/**
 * Which shape this process is running as, what version it is, and
 * whether a newer one exists (docs/spec/updates.md).
 *
 * The shape is the whole point. "There is a new version" is not useful
 * on its own — what somebody needs is the one action that applies it
 * here, and that differs completely between a desktop app that updates
 * itself and a Deployment that pulls on restart. Guessing wrong is
 * worse than saying nothing, so this detects rather than assumes, and
 * the one shape that can apply an update from inside the app is the one
 * where something is guaranteed to start the process again.
 */

export const SERVER_VERSION: string = serverVersion;

/** Where the release feed lives. Not configurable: an update check that
 * can be pointed anywhere is an update check that can be lied to. */
const RELEASES_URL =
	"https://api.github.com/repos/datagripe/datagripe/releases/latest";

/** A check nobody asked twice for. The button is manual; this only stops
 * a held-down finger becoming traffic. */
const CACHE_MS = 10 * 60 * 1000;

/** Long enough for a slow network, short enough to stay a button press. */
const TIMEOUT_MS = 6_000;

export function detectShape(
	env: NodeJS.ProcessEnv = process.env,
): DeploymentShape {
	// Kubernetes first, and ahead of anything the image says about
	// itself: the container image sets `container`, and in a pod that
	// answer is true but useless — what matters is that a Deployment
	// will start it again.
	if (typeof env.KUBERNETES_SERVICE_HOST === "string") {
		return "kubernetes";
	}
	// Set by the desktop shell and by the CLI launcher, which know what
	// they are. Nothing else should set it by hand.
	const declared = env.DATAGRIPE_SHAPE;
	if (
		declared === "desktop" ||
		declared === "cli" ||
		declared === "container"
	) {
		return declared;
	}
	if (existsSync("/.dockerenv")) {
		return "container";
	}
	return "source";
}

/**
 * Whether ending the process would bring a new one back. True in
 * Kubernetes, where a Deployment's whole job is that; otherwise only
 * when a deployment says so, because a container started without a
 * restart policy that exits is a DataGripe nobody is running.
 */
export function isSupervised(
	shape: DeploymentShape,
	config: Pick<AppConfig, "RESTART_TO_UPDATE">,
): boolean {
	return config.RESTART_TO_UPDATE ?? shape === "kubernetes";
}

export function appVersion(config: AppConfig): AppVersion {
	const shape = detectShape();
	return {
		server: SERVER_VERSION,
		shape,
		supervised: isSupervised(shape, config),
		updateCheck: !config.UPDATE_CHECK_DISABLED,
	};
}

/**
 * Compare two `a.b.c` versions. Anything unparseable sorts as equal, so
 * a tag nobody expected reads as "nothing to do" rather than as an
 * update that never installs.
 */
export function isNewer(latest: string, current: string): boolean {
	const parse = (value: string): number[] | null => {
		const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
		return match === null
			? null
			: [Number(match[1]), Number(match[2]), Number(match[3])];
	};
	const a = parse(latest);
	const b = parse(current);
	if (a === null || b === null) {
		return false;
	}
	for (let i = 0; i < 3; i += 1) {
		if ((a[i] as number) !== (b[i] as number)) {
			return (a[i] as number) > (b[i] as number);
		}
	}
	return false;
}

let cached: UpdateCheck | null = null;

/** The check, for tests and for a deployment that mirrors the feed. */
export interface UpdateCheckDeps {
	fetch?: typeof fetch;
	now?: () => Date;
}

/**
 * Ask the release feed once, on request. Nothing here runs on a timer:
 * a database tool that phones home on its own schedule is a database
 * tool somebody has to write a firewall rule about, and the answer is
 * only ever wanted when a person is looking at the menu.
 */
export async function checkForUpdate(
	config: AppConfig,
	deps: UpdateCheckDeps = {},
): Promise<UpdateCheck> {
	const now = deps.now ?? (() => new Date());
	const doFetch = deps.fetch ?? fetch;

	if (config.UPDATE_CHECK_DISABLED) {
		return {
			latest: null,
			url: null,
			newer: false,
			checkedAt: now().toISOString(),
			error: "This deployment has the update check turned off.",
		};
	}
	if (
		cached !== null &&
		now().getTime() - Date.parse(cached.checkedAt) < CACHE_MS
	) {
		return cached;
	}

	const result = await (async (): Promise<UpdateCheck> => {
		try {
			const response = await doFetch(RELEASES_URL, {
				headers: { accept: "application/vnd.github+json" },
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
			if (!response.ok) {
				return {
					latest: null,
					url: null,
					newer: false,
					checkedAt: now().toISOString(),
					error: `The release feed answered ${response.status}.`,
				};
			}
			const body = (await response.json()) as {
				tag_name?: unknown;
				html_url?: unknown;
			};
			const tag =
				typeof body.tag_name === "string"
					? body.tag_name.replace(/^v/, "")
					: null;
			return {
				latest: tag,
				url: typeof body.html_url === "string" ? body.html_url : null,
				newer: tag !== null && isNewer(tag, SERVER_VERSION),
				checkedAt: now().toISOString(),
				error: tag === null ? "The release feed named no version." : null,
			};
		} catch (cause) {
			// A check that could not reach the feed is a network, not a
			// verdict: never report "up to date" on a failure.
			return {
				latest: null,
				url: null,
				newer: false,
				checkedAt: now().toISOString(),
				error:
					cause instanceof Error && cause.name === "TimeoutError"
						? "The release feed did not answer in time."
						: "Could not reach the release feed.",
			};
		}
	})();

	cached = result;
	return result;
}

/** Tests share a module; a cached answer would leak between them. */
export function resetUpdateCache(): void {
	cached = null;
}
