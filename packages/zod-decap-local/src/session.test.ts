import { createServer } from "node:net";
import { afterEach, describe, expect, test } from "bun:test";
import {
	DEFAULT_DECAP_PROXY_PORT,
	alignedLocalBackendUrl,
	ensureLocalDecapSession,
	localBackendUrl,
	pickProxyPort,
	resetLocalDecapSessionForTests,
	stopLocalDecapSession,
} from "./session";

afterEach(() => {
	resetLocalDecapSessionForTests();
});

describe("localBackendUrl", () => {
	test("points Decap at the proxy API", () => {
		expect(localBackendUrl(8081)).toBe("http://127.0.0.1:8081/api/v1");
		expect(localBackendUrl(9090)).toBe("http://127.0.0.1:9090/api/v1");
	});
});

describe("alignedLocalBackendUrl", () => {
	test("is not ready until a session owns a port", () => {
		expect(alignedLocalBackendUrl()).toBeUndefined();
	});
});

describe("pickProxyPort", () => {
	test("prefers 8081 when free", async () => {
		const port = await pickProxyPort({
			isPortOpen: async () => false,
			findFreePort: async () => 9999,
		});
		expect(port).toBe(DEFAULT_DECAP_PROXY_PORT);
	});

	test("picks a free port when 8081 is busy (no soft-adopt)", async () => {
		const port = await pickProxyPort({
			isPortOpen: async (p) => p === DEFAULT_DECAP_PROXY_PORT,
			findFreePort: async () => 9091,
		});
		expect(port).toBe(9091);
	});
});

describe("ensureLocalDecapSession", () => {
	test("aligns config then starts and awaits ready", async () => {
		const aligned: string[] = [];
		const fakeServer = createServer((_req, res) => {
			res.end("ok");
		});
		const listenPort = await new Promise<number>((resolve, reject) => {
			fakeServer.listen(0, "127.0.0.1", () => {
				const addr = fakeServer.address();
				if (!addr || typeof addr === "string") reject(new Error("no port"));
				else resolve(addr.port);
			});
			fakeServer.on("error", reject);
		});
		const result = await ensureLocalDecapSession({
			cwd: process.cwd(),
			alignConfig: (backendUrl) => {
				aligned.push(backendUrl);
			},
			readyTimeoutMs: 500,
			deps: {
				resolve: () => ({
					ok: true,
					bin: "/dev/null",
					version: "3.11.0",
				}),
				spawn: () =>
					({
						pid: 1,
						exitCode: null,
						killed: false,
						kill: () => true,
						on: () => undefined,
					}) as unknown as ReturnType<
						typeof import("node:child_process").spawn
					>,
				// 8081 busy → pick listenPort; that port is open (fakeServer).
				isPortOpen: async (p) =>
					p === DEFAULT_DECAP_PROXY_PORT || p === listenPort,
				findFreePort: async () => listenPort,
			},
		});

		expect(aligned).toEqual([localBackendUrl(listenPort)]);
		expect(result).toMatchObject({
			status: "started",
			port: listenPort,
			version: "3.11.0",
		});
		expect(alignedLocalBackendUrl()).toBe(localBackendUrl(listenPort));

		const reused = await ensureLocalDecapSession({
			cwd: process.cwd(),
			alignConfig: (backendUrl) => {
				aligned.push(backendUrl);
			},
			deps: {
				isPortOpen: async () => true,
			},
		});
		expect(reused.status).toBe("reused");
		expect(aligned).toEqual([
			localBackendUrl(listenPort),
			localBackendUrl(listenPort),
		]);

		stopLocalDecapSession();
		await new Promise<void>((resolve) => fakeServer.close(() => resolve()));
	});

	test("fails when resolve misses the pin", async () => {
		const result = await ensureLocalDecapSession({
			cwd: process.cwd(),
			alignConfig: () => undefined,
			deps: {
				resolve: () => ({
					ok: false,
					message: "missing pin",
				}),
				isPortOpen: async () => false,
				findFreePort: async () => 8081,
				spawn: () => {
					throw new Error("should not spawn");
				},
			},
		});
		expect(result).toEqual({
			status: "failed",
			message: "missing pin",
			port: 8081,
		});
	});

	test("fails when ready timeout elapses", async () => {
		const result = await ensureLocalDecapSession({
			cwd: process.cwd(),
			alignConfig: () => undefined,
			readyTimeoutMs: 80,
			deps: {
				resolve: () => ({
					ok: true,
					bin: "/dev/null",
					version: "3.11.0",
				}),
				spawn: () =>
					({
						pid: 1,
						exitCode: null,
						killed: false,
						kill: () => true,
						on: () => undefined,
					}) as unknown as ReturnType<
						typeof import("node:child_process").spawn
					>,
				isPortOpen: async () => false,
				findFreePort: async () => 8123,
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
	});
});
