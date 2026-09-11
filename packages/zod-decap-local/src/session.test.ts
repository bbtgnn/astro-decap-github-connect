import { afterEach, describe, expect, test } from "bun:test";
import {
	alignedLocalBackendUrl,
	DEFAULT_DECAP_PROXY_PORT,
	ensureLocalDecapSession,
	localBackendUrl,
	resetLocalDecapSessionForTests,
	stopLocalDecapSession,
} from "./session";

afterEach(() => {
	resetLocalDecapSessionForTests();
});

function fakeProc(): ReturnType<typeof import("node:child_process").spawn> {
	return {
		pid: 1,
		exitCode: null,
		killed: false,
		kill: () => true,
		on: () => undefined,
	} as unknown as ReturnType<typeof import("node:child_process").spawn>;
}

describe("localBackendUrl", () => {
	test("points Decap at the fixed proxy API", () => {
		expect(localBackendUrl()).toBe("http://127.0.0.1:8081/api/v1");
		expect(localBackendUrl(DEFAULT_DECAP_PROXY_PORT)).toBe(
			"http://127.0.0.1:8081/api/v1",
		);
	});
});

describe("alignedLocalBackendUrl", () => {
	test("is not ready until a session owns the port", () => {
		expect(alignedLocalBackendUrl()).toBeUndefined();
	});
});

describe("ensureLocalDecapSession", () => {
	test("starts on 8081, awaits ready, then reuses", async () => {
		let listening = false;
		const result = await ensureLocalDecapSession({
			cwd: process.cwd(),
			readyTimeoutMs: 500,
			deps: {
				resolve: () => ({
					ok: true,
					bin: "/dev/null",
					version: "3.11.0",
				}),
				spawn: () => {
					listening = true;
					return fakeProc();
				},
				isPortOpen: async () => listening,
			},
		});

		expect(result).toMatchObject({
			status: "started",
			port: DEFAULT_DECAP_PROXY_PORT,
			version: "3.11.0",
		});
		expect(alignedLocalBackendUrl()).toBe(localBackendUrl());

		const reused = await ensureLocalDecapSession({
			cwd: process.cwd(),
			deps: {
				isPortOpen: async () => true,
				spawn: () => {
					throw new Error("should not spawn on reuse");
				},
			},
		});
		expect(reused).toMatchObject({
			status: "reused",
			port: DEFAULT_DECAP_PROXY_PORT,
			version: "3.11.0",
		});
		expect(alignedLocalBackendUrl()).toBe(localBackendUrl());

		stopLocalDecapSession();
		expect(alignedLocalBackendUrl()).toBeUndefined();
	});

	test("fails when 8081 is busy (stranger; no soft-adopt)", async () => {
		const result = await ensureLocalDecapSession({
			cwd: process.cwd(),
			deps: {
				resolve: () => ({
					ok: true,
					bin: "/dev/null",
					version: "3.11.0",
				}),
				isPortOpen: async () => true,
				spawn: () => {
					throw new Error("should not spawn");
				},
			},
		});
		expect(result).toEqual({
			status: "failed",
			message:
				"Port 8081 is already in use. Free :8081 (do not soft-adopt strangers) and retry.",
			port: DEFAULT_DECAP_PROXY_PORT,
		});
		expect(alignedLocalBackendUrl()).toBeUndefined();
	});

	test("fails when resolve misses the pin", async () => {
		const result = await ensureLocalDecapSession({
			cwd: process.cwd(),
			deps: {
				resolve: () => ({
					ok: false,
					message: "missing pin",
				}),
				isPortOpen: async () => false,
				spawn: () => {
					throw new Error("should not spawn");
				},
			},
		});
		expect(result).toEqual({
			status: "failed",
			message: "missing pin",
			port: DEFAULT_DECAP_PROXY_PORT,
		});
	});

	test("fails when ready timeout elapses", async () => {
		const result = await ensureLocalDecapSession({
			cwd: process.cwd(),
			readyTimeoutMs: 80,
			deps: {
				resolve: () => ({
					ok: true,
					bin: "/dev/null",
					version: "3.11.0",
				}),
				spawn: () => fakeProc(),
				isPortOpen: async () => false,
				now: (() => {
					let t = 0;
					return () => {
						t += 100;
						return t;
					};
				})(),
				sleep: async () => undefined,
			},
		});
		expect(result.status).toBe("failed");
		if (result.status === "failed") {
			expect(result.message).toMatch(/did not accept connections/);
			expect(result.port).toBe(DEFAULT_DECAP_PROXY_PORT);
		}
		expect(alignedLocalBackendUrl()).toBeUndefined();
	});
});
