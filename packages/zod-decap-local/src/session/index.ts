/**
 * Local editorial session: Decap emit and pinned `decap-server` lifecycle for
 * `local_backend`. Proxy is always :8081 (strangers → fail). Astro hooks stay
 * a thin adapter over this. Schema/content-config edits need an Astro restart —
 * emit runs at config setup only (no schema watch).
 */

import {
	type ChildProcess,
	spawn as nodeSpawn,
	spawnSync,
} from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import {
	type DecapServerResolve,
	missingDecapServerMessage,
	resolveDecapServer,
} from "../decap-server";

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

export type SessionLogger = {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
};

export type EditorialSessionOptions = {
	/** Override path to Astro content config (default: auto-discover src/content.config.*). */
	contentConfig?: string;
	outFile?: string;
	mediaFolder?: string;
	publicFolder?: string;
};

export type EditorialSession = {
	/** Run Decap emit once via the compiled CLI (`process.execPath`). */
	emit(): { wrote: boolean };
	/** Resolve / reuse / spawn pinned `decap-server` for local_backend. */
	ensureDecapServer(deps?: SessionDeps): Promise<EnsureResult>;
	/** Log the Decap admin URL once Astro has bound a port. */
	logAdminUrl(
		address: { address: string; port: number },
		adminRoute: string,
		logger: SessionLogger,
	): void;
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

export function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
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
	const { cwd, readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS, deps = {} } = options;
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

export function logEnsureResult(
	logger: SessionLogger,
	result: EnsureResult,
): void {
	if (result.status === "reused") {
		logger.info(
			`Reusing decap-server on :${result.port}${result.version ? `@${result.version}` : ""} (config reload)`,
		);
		return;
	}
	if (result.status === "started") {
		if (result.warn) logger.warn(result.warn);
		logger.info(
			`Started decap-server@${result.version} for local_backend on :${result.port}`,
		);
		return;
	}
	logger.error(result.message);
}

/**
 * Compiled CLI next to the Astro adapter bundle (`dist/cli.js` after build).
 * Bundled into `astro.js`, so `import.meta.url` is the adapter outfile.
 */
function resolveCliEntry(): string {
	const entry = fileURLToPath(new URL("./cli.js", import.meta.url));
	if (!existsSync(entry)) {
		throw new Error(
			`zod-decap-local CLI missing at ${entry}. Run \`bun run build\` in packages/zod-decap-local.`,
		);
	}
	return entry;
}

function runEmitCli(
	root: string,
	options: EditorialSessionOptions,
): { wrote: boolean } {
	const args = [resolveCliEntry(), "--root", root];
	if (options.contentConfig) {
		args.push("--content-config", options.contentConfig);
	}
	if (options.outFile) args.push("--out", options.outFile);
	if (options.mediaFolder) args.push("--media-folder", options.mediaFolder);
	if (options.publicFolder) args.push("--public-folder", options.publicFolder);

	const child = spawnSync(process.execPath, args, {
		cwd: root,
		encoding: "utf8",
		env: process.env,
	});
	if (child.status !== 0) {
		throw new Error(
			(child.stderr || child.stdout || "Decap emit failed").trim(),
		);
	}
	const out = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
	return { wrote: /Wrote config\.yml/.test(out) };
}

export function createEditorialSession(
	root: string,
	options: EditorialSessionOptions = {},
): EditorialSession {
	return {
		emit() {
			return runEmitCli(root, options);
		},

		ensureDecapServer(deps) {
			return ensureLocalDecapSession({ cwd: root, deps });
		},

		logAdminUrl(address, adminRoute, logger) {
			const host =
				address.address === "::" || address.address === "::1"
					? "127.0.0.1"
					: address.address;
			const { port } = address;
			if (port !== 4321) {
				logger.info(
					`Astro bound :${port} (4321 was busy). Decap admin: http://${host}:${port}${adminRoute}`,
				);
			} else {
				logger.info(`Decap admin: http://${host}:${port}${adminRoute}`);
			}
		},
	};
}
