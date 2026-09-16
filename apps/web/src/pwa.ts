import { registerSW } from "virtual:pwa-register";
import { usePwaStore } from "./stores/pwa";

// Re-check for a new build hourly and whenever the window regains focus;
// registerType is "prompt", so detection never reloads the page by itself —
// it only surfaces the refresh (stores/pwa.ts, VersionStatus).
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How long to wait for a new worker to finish installing before giving
 * up on it. Precaching a Monaco-sized bundle is seconds, not
 * milliseconds, and the caller is usually staring at "restarting…".
 */
const INSTALL_WAIT_MS = 30_000;

/** Resolve when this worker stops installing, or when waiting stops
 * being worth it. */
function settled(worker: ServiceWorker): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			if (worker.state !== "installing") {
				worker.removeEventListener("statechange", done);
				resolve();
			}
		};
		worker.addEventListener("statechange", done);
		setTimeout(() => {
			worker.removeEventListener("statechange", done);
			resolve();
		}, INSTALL_WAIT_MS);
		done();
	});
}

export function registerAppServiceWorker(): void {
	const updateSW = registerSW({
		immediate: true,
		onNeedRefresh() {
			usePwaStore.setState({ updateAvailable: true });
		},
		onRegisteredSW(_swUrl, registration) {
			if (registration === undefined) {
				return;
			}
			setInterval(() => {
				void registration.update();
			}, UPDATE_CHECK_INTERVAL_MS);
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "visible") {
					void registration.update();
				}
			});
			usePwaStore.setState({
				checkForNewBuild: async () => {
					// `update()` resolves when the check is done, which is not
					// when the new worker is usable: it may still be installing
					// every asset it precaches.
					await registration.update().catch(() => undefined);
					const installing = registration.installing;
					if (installing !== null) {
						await settled(installing);
					}
					return registration.waiting !== null;
				},
			});
		},
	});
	usePwaStore.setState({
		applyUpdate: () => {
			void updateSW(true);
		},
	});
}
