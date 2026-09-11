/**
 * Local Decap session — package-private lifecycle for pinned `decap-server`.
 * Binary from the library; cwd = app root for write-back. Proxy is always :8081.
 */
import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { createConnection } from "node:net";
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

export type EnsureResult =
	| { status: "started"; port: number; version: string; warn?: string }
	| { status: "reused"; port: number; version?: string }
	| { status: "failed"; message: string; port?: number };

export type SessionDeps = {
	resolve?: () => DecapServerResolve;
	spawn?: typeof nodeSpawn;
	isPortOpen?: (port: number, host?: string) => Promise<boolean>;
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
	port: number = DEFAULT_DECAP_PROXY_PORT,
	host = "127.0.0.1",
): string {
	return `http://${host}:${port}/api/v1`;
}

/**
 * Proxy API URL when the session owns :8081; otherwise not ready.
 * Honest fixed-port helper — callers must not invent an alternate URL.
 */
export function alignedLocalBackendUrl(): string | undefined {
	if (sessionState().port == null) return undefined;
	return localBackendUrl(DEFAULT_DECAP_PROXY_PORT);
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
 * Ensure a local Decap proxy for `cwd` on the fixed Decap default port (:8081).
 * Reuses the process-global session across Vite reloads; fails if a stranger holds 8081.
 */
export async function ensureLocalDecapSession(options: {
	cwd: string;
	readyTimeoutMs?: number;
	deps?: SessionDeps;
}): Promise<EnsureResult> {
	const {
		cwd,
		readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
		deps = {},
	} = options;
	const state = sessionState();
	const resolve = deps.resolve ?? (() => resolveDecapServer());
	const spawn = deps.spawn ?? nodeSpawn;
	const open = deps.isPortOpen ?? isPortOpen;
	const port = DEFAULT_DECAP_PROXY_PORT;

	if (isAlive(state.proc) && state.port != null) {
		return {
			status: "reused",
			port: state.port,
			version: state.version,
		};
	}

	// Stale handle — clear before claiming the port.
	state.proc = undefined;
	state.port = undefined;
	state.version = undefined;

	if (await open(port)) {
		return {
			status: "failed",
			message: `Port ${port} is already in use. Free :${port} (do not soft-adopt strangers) and retry.`,
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
