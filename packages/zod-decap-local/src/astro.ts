import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { missingDecapServerMessage, resolveDecapServer } from "./decap-server";
import {
	resolveContentConfigPath,
	viteAliasesForBoot,
} from "./content-paths";

const DECAP_SERVER_PORT = 8081;
const GLOBAL_DECAP = Symbol.for("zod-decap-local.decapProc");
const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url));

type DecapGlobal = { proc?: ChildProcess };

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

function bunBin(): string {
	return typeof process.execPath === "string" &&
		process.execPath.includes("bun")
		? process.execPath
		: "bun";
}

/** Run Decap emit in a child Bun process (avoids Vite module-runner). */
function runEmitCli(root: string, options: ZodDecapOptions): void {
	const args = [CLI, "--root", root];
	if (options.contentConfig) {
		args.push("--content-config", options.contentConfig);
	}
	if (options.outFile) args.push("--out", options.outFile);
	if (options.mediaFolder) args.push("--media-folder", options.mediaFolder);
	if (options.publicFolder) args.push("--public-folder", options.publicFolder);

	const child = spawnSync(bunBin(), args, {
		cwd: root,
		encoding: "utf8",
		env: process.env,
	});
	if (child.status !== 0) {
		throw new Error(
			(child.stderr || child.stdout || "Decap emit failed").trim(),
		);
	}
}

export type ZodDecapOptions = {
	/** Override path to Astro content config (default: auto-discover src/content.config.*). */
	contentConfig?: string;
	outFile?: string;
	adminRoute?: string;
	mediaFolder?: string;
	publicFolder?: string;
	/** Spawn `decap-server` during `astro dev`. Default true. */
	startDecapServer?: boolean;
	/**
	 * Watch content config (and optional extras) in `astro dev` and regenerate YAML.
	 * `true` watches the content config only; pass paths for schema modules etc.
	 */
	watchSchemas?: boolean | string | readonly string[];
	/** Extra modules to watch when regenerating (e.g. `src/lib/schemas.ts`). */
	watchExtra?: string | readonly string[];
};

function resolveWatchModules(
	root: string,
	contentConfigAbs: string,
	watch: ZodDecapOptions["watchSchemas"],
	watchExtra: ZodDecapOptions["watchExtra"],
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

export function zodDecap(options: ZodDecapOptions = {}): AstroIntegration {
	const startDecapServer = options.startDecapServer ?? true;
	const adminRoute = options.adminRoute ?? "/admin";
	let decapProc: ChildProcess | undefined;
	let projectRoot = "";
	let contentConfigAbs = "";

	return {
		name: "zod-decap-local",
		hooks: {
			"astro:config:setup": async ({
				command,
				config,
				injectRoute,
				logger,
				updateConfig,
			}) => {
				const root = fileURLToPath(config.root);
				projectRoot = root;
				contentConfigAbs = resolveContentConfigPath(
					root,
					options.contentConfig,
				);

				updateConfig({
					vite: {
						resolve: {
							alias: viteAliasesForBoot(),
						},
					},
				});

				try {
					runEmitCli(root, options);
					logger.info(`Wrote ${options.outFile ?? "public/admin/config.yml"}`);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					logger.error(`Decap emit failed: ${msg}`);
					throw err;
				}

				injectRoute({
					pattern: adminRoute,
					entrypoint: new URL("./admin.astro", import.meta.url),
				});

				if (command === "dev" && startDecapServer) {
					void (async () => {
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
						logger.info(
							`Started decap-server@${resolved.version} for local_backend`,
						);
					})();
				}
			},
			"astro:server:setup": ({ server, logger }) => {
				const watchFlag = options.watchSchemas ?? true;
				const modules = resolveWatchModules(
					projectRoot,
					contentConfigAbs,
					watchFlag,
					options.watchExtra,
				);
				if (modules.length === 0) return;

				for (const mod of modules) {
					server.watcher.add(mod);
				}

				const onChange = (changed: string) => {
					const hit = modules.some(
						(m) => changed === m || resolvePath(changed) === m,
					);
					if (!hit) return;
					try {
						runEmitCli(projectRoot, options);
						logger.info(
							`Regenerated ${options.outFile ?? "public/admin/config.yml"} (schema watch)`,
						);
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						logger.error(`Schema watch regenerate failed: ${msg}`);
					}
				};

				server.watcher.on("change", onChange);
			},
			"astro:server:start": ({ address, logger }) => {
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
		},
	};
}
