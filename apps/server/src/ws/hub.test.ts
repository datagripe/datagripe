import { describe, expect, test } from "bun:test";
import type { ServerEvent } from "@datagripe/contracts/ws";
import type { SocketData } from "./handler";
import { SocketHub } from "./hub";

/** Who a broadcast reaches (docs/spec/multiplayer.md 6d). */

interface FakeSocket {
	data: SocketData;
	sent: string[];
}

function socket(options: {
	socketId: string;
	workspaceId: string;
	sessionId?: string;
}): FakeSocket {
	const sent: string[] = [];
	return {
		sent,
		data: {
			requestId: `req-${options.socketId}`,
			socketId: options.socketId,
			userId: "user-1",
			email: "one@example.com",
			name: null,
			sessionId: options.sessionId ?? "session-1",
			workspace: {
				id: options.workspaceId,
				name: "Local",
				defaultConnectionRef: null,
			},
			role: "owner",
			capabilities: [],
		},
		// The hub only ever calls send(); the rest of the socket is Bun's.
		send(text: string) {
			sent.push(text);
		},
	} as unknown as FakeSocket;
}

const EVENT: ServerEvent = {
	version: 1,
	kind: "event",
	eventId: "event-1",
	topic: "document.changed",
	occurredAt: "2026-01-01T00:00:00.000Z",
	payload: { id: "doc-1" },
};

describe("broadcastToWorkspace", () => {
	test("reaches every socket in the workspace and no other", () => {
		const hub = new SocketHub();
		const here = socket({ socketId: "a", workspaceId: "ws-1" });
		const alsoHere = socket({ socketId: "b", workspaceId: "ws-1" });
		const elsewhere = socket({ socketId: "c", workspaceId: "ws-2" });
		for (const ws of [here, alsoHere, elsewhere]) {
			hub.add(ws as unknown as Bun.ServerWebSocket<SocketData>);
		}

		hub.broadcastToWorkspace("ws-1", EVENT);

		expect(here.sent).toHaveLength(1);
		expect(alsoHere.sent).toHaveLength(1);
		expect(elsewhere.sent).toHaveLength(0);
	});

	// The bug this exists for: the event leaves before the response does,
	// so a socket told about its own save saw "the server is ahead of
	// you" while its save was still in flight — every shared save raised
	// a conflict banner against itself.
	test("skips the socket that caused it, but not its sibling tab", () => {
		const hub = new SocketHub();
		const author = socket({ socketId: "a", workspaceId: "ws-1" });
		const otherTab = socket({
			socketId: "b",
			workspaceId: "ws-1",
			sessionId: "session-1",
		});
		for (const ws of [author, otherTab]) {
			hub.add(ws as unknown as Bun.ServerWebSocket<SocketData>);
		}

		hub.broadcastToWorkspace("ws-1", EVENT, "a");

		expect(author.sent).toHaveLength(0);
		expect(otherTab.sent).toHaveLength(1);
	});
});
