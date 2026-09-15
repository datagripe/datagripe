import { z } from "zod";

/**
 * What the account menu says about the running application
 * (docs/spec/updates.md): which version, which shape of deployment, and
 * whether a newer version exists.
 *
 * The shape is here because "there is an update" is not actionable on
 * its own. Applying one is a different act in every shape — the desktop
 * app does it itself, a Deployment does it on restart, a compose stack
 * needs a pull — and the menu's job is to name the one that applies
 * rather than to link to a page of six.
 */

export const deploymentShapeSchema = z.enum([
	"kubernetes",
	"container",
	"desktop",
	"cli",
	"source",
]);

export type DeploymentShape = z.infer<typeof deploymentShapeSchema>;

export const appVersionSchema = z.object({
	/** The server's own version. The UI's is a build-time constant in the
	 * bundle, so the menu can show the two separately — and it should:
	 * a browser holding an old bundle against a new server is exactly the
	 * state a stale service worker leaves behind. */
	server: z.string(),
	shape: deploymentShapeSchema,
	/** Something will start the process again if it ends, so the menu may
	 * offer to end it. */
	supervised: z.boolean(),
	/** False when the deployment turned the check off entirely. */
	updateCheck: z.boolean(),
});

export type AppVersion = z.infer<typeof appVersionSchema>;

export const updateCheckSchema = z.object({
	/** The newest published version, or null when the check could not say. */
	latest: z.string().nullable(),
	/** Where to read about it. */
	url: z.string().nullable(),
	newer: z.boolean(),
	checkedAt: z.iso.datetime(),
	/** Why there is no answer, in words. Never "up to date" on a failure. */
	error: z.string().nullable(),
});

export type UpdateCheck = z.infer<typeof updateCheckSchema>;
