/**
 * Local editorial session: Decap emit, schema-watch regen, and decap-server
 * lifecycle for `local_backend`. Astro hooks stay a thin adapter over this.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { missingDecapServerMessage, resolveDecapServer } from "../decap-server";

const DECAP_SERVER_PORT = 8081;
const GLOBAL_DECAP = Symbol.for("zod-decap-local.decapProc");

type DecapGlobal = { proc?: ChildProcess };

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
	/**
	 * Watch content config (and optional extras) in `astro dev` and regenerate YAML.
	 * `true` watches the content config only; pass paths for schema modules etc.
	 */
	watchSchemas?: boolean | string | readonly string[];
	/** Extra modules to watch when regenerating (e.g. `src/lib/schemas.ts`). */
	watchExtra?: string | readonly string[];
};

export type EditorialSession = {
	/** Run Decap emit once via the compiled CLI (`process.execPath`). */
	emit(): { wrote: boolean };
	/** Resolve / reuse / spawn pinned `decap-server` for local_backend. */
	ensureDecapServer(logger: SessionLogger): Promise<void>;
	/** Watch content config (and extras) and re-emit on change. */
	attachWatch(
		watcher: {
			add(path: string): void;
			on(event: "change", cb: (path: string) => void): void;
		},
		logger: SessionLogger,
	): void;
	/** Log the Decap admin URL once Astro has bound a port. */
	logAdminUrl(
		address: { address: string; port: number },
		adminRoute: string,
		logger: SessionLogger,
	): void;
};

function decapGlobal(): DecapGlobal {
	const g = globalThis as typeof globalThis & {
		[GLOBAL_DECAP]?: DecapGlobal;
	};
	if (!g[GLOBAL_DECAP]) g[GLOBAL_DECAP] = {};
	return g[GLOBAL_DECAP];
}

function isAlive(proc: ChildProcess | undefined): boolean {
	return Boolean(proc && proc.exitCode === null && !proc.killed);
}

function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ port, host }, () => {
			socket.end();
			resolve(true);
		});
		socket.on("error", () => resolve(false));
	});
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

function resolveWatchModules(
	root: string,
	contentConfigAbs: string,
	watch: EditorialSessionOptions["watchSchemas"],
	watchExtra: EditorialSessionOptions["watchExtra"],
): string[] {
	const extras = watchExtra
		? (typeof watchExtra === "string" ? [watchExtra] : [...watchExtra]).map(
				(p) => resolvePath(root, p),
			)
		: [];

	if (watch === undefined || watch === false) {
		return extras;
	}
	if (watch === true) {
		return [contentConfigAbs, ...extras];
	}
	const raw = typeof watch === "string" ? [watch] : [...watch];
	return [...raw.map((p) => resolvePath(root, p)), ...extras];
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
	contentConfigAbs: string,
	options: EditorialSessionOptions = {},
): EditorialSession {
	let decapProc: ChildProcess | undefined;

	return {
		emit() {
			return runEmitCli(root, options);
		},

		async ensureDecapServer(logger) {
			const state = decapGlobal();
			if (isAlive(state.proc)) {
				decapProc = state.proc;
				logger.info(
					`Reusing decap-server on :${DECAP_SERVER_PORT} (config reload)`,
				);
				return;
			}
			if (await isPortOpen(DECAP_SERVER_PORT)) {
				logger.info(
					`decap-server already listening on :${DECAP_SERVER_PORT}; not spawning another`,
				);
				return;
			}

			const resolved = resolveDecapServer(root);
			if (!resolved.ok) {
				logger.error(resolved.message);
				return;
			}
			if (resolved.warn) {
				logger.warn(resolved.warn);
			}

			decapProc = spawn(process.execPath, [resolved.bin], {
				cwd: root,
				stdio: "inherit",
				env: process.env,
			});
			state.proc = decapProc;
			decapProc.on("error", (err) => {
				logger.error(
					`Failed to start decap-server (${err.message}). ${missingDecapServerMessage()}`,
				);
			});
			decapProc.on("exit", (code, signal) => {
				if (state.proc === decapProc) state.proc = undefined;
				decapProc = undefined;
				if (code && code !== 0) {
					logger.error(
						`decap-server exited (code ${code}${signal ? `, signal ${signal}` : ""}). Local /admin writes need it running.`,
					);
				}
			});
			const stop = () => {
				state.proc?.kill();
				state.proc = undefined;
				decapProc = undefined;
			};
			process.on("exit", stop);
			process.on("SIGINT", stop);
			process.on("SIGTERM", stop);
			logger.info(`Started decap-server@${resolved.version} for local_backend`);
		},

		attachWatch(watcher, logger) {
			const watchFlag = options.watchSchemas ?? true;
			const modules = resolveWatchModules(
				root,
				contentConfigAbs,
				watchFlag,
				options.watchExtra,
			);
			if (modules.length === 0) return;

			for (const mod of modules) {
				watcher.add(mod);
			}

			watcher.on("change", (changed) => {
				const hit = modules.some(
					(m) => changed === m || resolvePath(changed) === m,
				);
				if (!hit) return;
				try {
					const { wrote } = runEmitCli(root, options);
					if (wrote) {
						logger.info(
							`Regenerated ${options.outFile ?? "public/admin/config.yml"} (schema watch)`,
						);
					}
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					logger.error(`Schema watch regenerate failed: ${msg}`);
				}
			});
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
