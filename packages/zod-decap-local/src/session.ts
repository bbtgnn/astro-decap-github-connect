/**
 * Local Decap session — package-private lifecycle for pinned `decap-server`.
 * Binary from the library; cwd = app root for write-back. Prefer :8081; else free port + align config.
 */
import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import {
	missingDecapServerMessage,
	resolveDecapServer,
	type DecapServerResolve,
} from "./decap-server";

export const DEFAULT_DECAP_PROXY_PORT = 8081;
export const DEFAULT_READY_TIMEOUT_MS = 2000;

const GLOBAL_SESSION = Symbol.for("zod-decap-local.decapSession");

type SessionState = {
	proc?: ChildProcess;
	port?: number;
	version?: string;
	signalsRegistered?: boolean;
};

export type AlignConfig = (port: number) => void | Promise<void>;

export type EnsureResult =
	| { status: "started"; port: number; version: string; warn?: string }
	| { status: "reused"; port: number; version?: string }
	| { status: "failed"; message: string; port?: number };

export type SessionDeps = {
	resolve?: () => DecapServerResolve;
	spawn?: typeof nodeSpawn;
	isPortOpen?: (port: number, host?: string) => Promise<boolean>;
	findFreePort?: () => Promise<number>;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
};

function sessionState(): SessionState {
	const g = globalThis as typeof globalThis & {
		[GLOBAL_SESSION]?: SessionState;
	};
	if (!g[GLOBAL_SESSION]) g[GLOBAL_SESSION] = {};
	return g[GLOBAL_SESSION];
}

/** Test helper: clear process-global session state. */
export function resetLocalDecapSessionForTests(): void {
	const state = sessionState();
	state.proc?.kill();
	state.proc = undefined;
	state.port = undefined;
	state.version = undefined;
	state.signalsRegistered = false;
}

export function getLocalDecapSessionPort(): number | undefined {
	return sessionState().port;
}

export function localBackendUrl(
	port: number,
	host = "127.0.0.1",
): string {
	return `http://${host}:${port}/api/v1`;
}

export function isAlive(proc: ChildProcess | undefined): boolean {
	return Boolean(proc && proc.exitCode === null && !proc.killed);
}

export function isPortOpen(
	port: number,
	host = "127.0.0.1",
): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ port, host }, () => {
			socket.end();
			resolve(true);
		});
		socket.on("error", () => resolve(false));
	});
}

export function findFreePort(host = "127.0.0.1"): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, host, () => {
			const addr = server.address();
			if (!addr || typeof addr === "string") {
				server.close(() => reject(new Error("Could not allocate a free port")));
				return;
			}
			const { port } = addr;
			server.close((err) => {
				if (err) reject(err);
				else resolve(port);
			});
		});
		server.on("error", reject);
	});
}

/** Prefer 8081 when free; otherwise any free port (no soft-adopt of strangers). */
export async function pickProxyPort(
	deps: Pick<SessionDeps, "isPortOpen" | "findFreePort"> = {},
): Promise<number> {
	const open = deps.isPortOpen ?? isPortOpen;
	const free = deps.findFreePort ?? findFreePort;
	if (!(await open(DEFAULT_DECAP_PROXY_PORT))) {
		return DEFAULT_DECAP_PROXY_PORT;
	}
	return free();
}

async function waitUntilPortOpen(
	port: number,
	timeoutMs: number,
	deps: Pick<SessionDeps, "isPortOpen" | "now" | "sleep">,
): Promise<boolean> {
	const open = deps.isPortOpen ?? isPortOpen;
	const now = deps.now ?? Date.now;
	const sleep =
		deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
	const deadline = now() + timeoutMs;
	while (now() < deadline) {
		if (await open(port)) return true;
		await sleep(50);
	}
	return open(port);
}

function registerStopSignalsOnce(state: SessionState): void {
	if (state.signalsRegistered) return;
	state.signalsRegistered = true;
	const stop = () => {
		stopLocalDecapSession();
	};
	process.on("exit", stop);
	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);
}

export function stopLocalDecapSession(): void {
	const state = sessionState();
	if (state.proc && isAlive(state.proc)) {
		state.proc.kill();
	}
	state.proc = undefined;
	state.port = undefined;
	state.version = undefined;
}

/**
 * Ensure a local Decap proxy for `cwd`. Calls `alignConfig(port)` after choosing
 * the port and before spawn so YAML and process never disagree.
 */
export async function ensureLocalDecapSession(options: {
	cwd: string;
	alignConfig: AlignConfig;
	readyTimeoutMs?: number;
	deps?: SessionDeps;
}): Promise<EnsureResult> {
	const {
		cwd,
		alignConfig,
		readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
		deps = {},
	} = options;
	const state = sessionState();
	const resolve = deps.resolve ?? (() => resolveDecapServer());
	const spawn = deps.spawn ?? nodeSpawn;
	const open = deps.isPortOpen ?? isPortOpen;

	if (isAlive(state.proc) && state.port != null) {
		await alignConfig(state.port);
		return {
			status: "reused",
			port: state.port,
			version: state.version,
		};
	}

	// Stale handle — clear before picking a port.
	state.proc = undefined;

	let port: number;
	try {
		port = await pickProxyPort({
			isPortOpen: open,
			findFreePort: deps.findFreePort,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { status: "failed", message: `Could not pick proxy port: ${message}` };
	}

	try {
		await alignConfig(port);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			status: "failed",
			message: `Failed to align Decap config for port ${port}: ${message}`,
			port,
		};
	}

	const resolved = resolve();
	if (!resolved.ok) {
		return { status: "failed", message: resolved.message, port };
	}

	let proc: ChildProcess;
	try {
		proc = spawn(process.execPath, [resolved.bin], {
			cwd,
			stdio: "inherit",
			env: { ...process.env, PORT: String(port) },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			status: "failed",
			message: `Failed to start decap-server (${message}). ${missingDecapServerMessage()}`,
			port,
		};
	}

	state.proc = proc;
	state.port = port;
	state.version = resolved.version;
	registerStopSignalsOnce(state);

	proc.on("error", () => {
		if (state.proc === proc) {
			state.proc = undefined;
			state.port = undefined;
			state.version = undefined;
		}
	});
	proc.on("exit", () => {
		if (state.proc === proc) {
			state.proc = undefined;
			state.port = undefined;
			state.version = undefined;
		}
	});

	const ready = await waitUntilPortOpen(port, readyTimeoutMs, deps);
	if (!ready) {
		proc.kill();
		if (state.proc === proc) {
			state.proc = undefined;
			state.port = undefined;
			state.version = undefined;
		}
		return {
			status: "failed",
			message: `decap-server did not accept connections on :${port} within ${readyTimeoutMs}ms`,
			port,
		};
	}

	return {
		status: "started",
		port,
		version: resolved.version,
		warn: resolved.warn,
	};
}
