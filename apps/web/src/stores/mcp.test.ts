import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { McpStatus } from "@datagripe/contracts";
import { wsClient } from "../api/ws";
import { showMcpHeader, useMcpStore } from "./mcp";

const enabled: McpStatus = {
	available: true,
	enabled: true,
	mode: "read-write",
	tokenCount: 1,
};
let request: ReturnType<typeof spyOn<typeof wsClient, "request">>;

beforeEach(() => {
	useMcpStore.getState().reset();
	request = spyOn(wsClient, "request");
});
afterEach(() => {
	request.mockRestore();
	useMcpStore.getState().reset();
});

describe("MCP sidebar status", () => {
	test("a failed status read keeps the launcher visible and preserves the error", async () => {
		request.mockRejectedValue(new Error("Connection lost"));
		await useMcpStore.getState().loadStatus();
		const state = useMcpStore.getState();
		expect(state.status).toBeNull();
		expect(state.statusError).toBe("Connection lost");
		expect(state.statusLoading).toBe(false);
		expect(showMcpHeader(true, state.status)).toBe(true);
	});
	test("retry recovers the enabled mode and clears the failure", async () => {
		request
			.mockRejectedValueOnce(new Error("Temporary failure"))
			.mockResolvedValueOnce(enabled);
		await useMcpStore.getState().loadStatus();
		await useMcpStore.getState().loadStatus();
		expect(useMcpStore.getState()).toMatchObject({
			status: enabled,
			statusError: null,
			statusLoading: false,
		});
	});
	test("only explicit deployment disablement or missing permission hides the header", () => {
		expect(showMcpHeader(true, null)).toBe(true);
		expect(showMcpHeader(true, enabled)).toBe(true);
		expect(showMcpHeader(true, { ...enabled, available: false })).toBe(false);
		expect(showMcpHeader(false, null)).toBe(false);
		expect(showMcpHeader(false, enabled)).toBe(false);
	});
	test("a status response from a previous workspace cannot hide the current launcher", async () => {
		const pending = Promise.withResolvers<McpStatus>();
		request.mockReturnValueOnce(pending.promise);
		const loading = useMcpStore.getState().loadStatus();
		useMcpStore.getState().reset();
		pending.resolve({ ...enabled, available: false });
		await loading;
		expect(useMcpStore.getState()).toMatchObject({
			status: null,
			statusLoading: false,
			statusError: null,
		});
		expect(showMcpHeader(true, useMcpStore.getState().status)).toBe(true);
	});
});
