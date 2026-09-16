import type { ServerEvent } from "@datagripe/contracts/ws";
import type { SocketData } from "./handler";

/**
 * Live socket inventory with workspace scoping. Lifecycle events
 * broadcast workspace-wide; row payloads go only to sockets subscribed
 * to that execution (docs/spec/multiplayer.md 6d).
 */
export class SocketHub {
	private readonly sockets = new Set<Bun.ServerWebSocket<SocketData>>();
	private readonly executionSubscribers = new Map<
		string,
		Set<Bun.ServerWebSocket<SocketData>>
	>();

	add(ws: Bun.ServerWebSocket<SocketData>): void {
		this.sockets.add(ws);
	}

	remove(ws: Bun.ServerWebSocket<SocketData>): void {
		this.sockets.delete(ws);
		for (const subscribers of this.executionSubscribers.values()) {
			subscribers.delete(ws);
		}
	}

	broadcastToUser(userId: string, event: ServerEvent): void {
		const text = JSON.stringify(event);
		for (const ws of this.sockets) {
			if (ws.data.userId === userId) {
				ws.send(text);
			}
		}
	}

	/**
	 * Every socket in a project, so a permission change reaches the
	 * sessions it changes. A socket carries the capabilities it was
	 * opened with — resolving them per message would be a query per
	 * message — so the one thing that must not wait for a reconnect is
	 * somebody having a capability taken away
	 * (docs/spec/permissions.md).
	 */
	socketsInWorkspace(workspaceId: string): Bun.ServerWebSocket<SocketData>[] {
		return [...this.sockets].filter(
			(ws) => ws.data.workspace.id === workspaceId,
		);
	}

	/**
	 * `except` is the socket that caused the event. Telling somebody what
	 * they just told you is not information, it is a race: the event
	 * leaves before the response does, so the sender would be handed a
	 * "the server moved ahead of you" about their own write while their
	 * own save was still in flight. Other tabs of the same session are
	 * not the same socket and are told.
	 */
	broadcastToWorkspace(
		workspaceId: string,
		event: ServerEvent,
		except?: string,
	): void {
		const text = JSON.stringify(event);
		for (const ws of this.sockets) {
			if (ws.data.workspace.id === workspaceId && ws.data.socketId !== except) {
				ws.send(text);
			}
		}
	}

	/** Lifecycle events → workspace; row batches → subscribers only. */
	broadcastExecution(workspaceId: string, event: ServerEvent): void {
		if (event.topic === "execution.rows" && event.executionId !== undefined) {
			const subscribers = this.executionSubscribers.get(event.executionId);
			if (subscribers === undefined || subscribers.size === 0) {
				return;
			}
			const text = JSON.stringify(event);
			for (const ws of subscribers) {
				if (this.sockets.has(ws)) {
					ws.send(text);
				}
			}
			return;
		}
		this.broadcastToWorkspace(workspaceId, event);
	}

	subscribeToExecution(
		executionId: string,
		ws: Bun.ServerWebSocket<SocketData>,
	): void {
		let subscribers = this.executionSubscribers.get(executionId);
		if (subscribers === undefined) {
			subscribers = new Set();
			this.executionSubscribers.set(executionId, subscribers);
		}
		subscribers.add(ws);
	}

	/** Close every socket bound to a revoked/expired session. */
	closeForSession(sessionId: string): void {
		for (const ws of this.sockets) {
			if (ws.data.sessionId === sessionId) {
				ws.close(1000, "session ended");
			}
		}
	}

	get size(): number {
		return this.sockets.size;
	}
}
