import { type ChildProcess, spawn } from "node:child_process";
import { createConnection } from "node:net";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AstroIntegration } from "astro";
import {
	type CollectionSpec,
	type WriteDecapConfigOptions,
	writeDecapConfig,
} from "./codegen";
import { missingDecapServerMessage, resolveDecapServer } from "./decap-server";

/** Default Decap local proxy port. */
const DECAP_SERVER_PORT = 8081;

const GLOBAL_DECAP = Symbol.for("zod-decap-local.decapProc");

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

export type ZodDecapOptions = {
	collections: readonly CollectionSpec[] | CollectionSpec[];
	outFile?: string;
	adminRoute?: string;
	mediaFolder?: string;
	publicFolder?: string;
	schemaOwnerHint?: string;
	/** Spawn `decap-server` during `astro dev`. Default true. */
	startDecapServer?: boolean;
	/**
	 * Opt-in: in `astro dev`, watch schema module(s) and rewrite `config.yml`
	 * without waiting for a full Astro restart. `true` uses `schemaOwnerHint`
	 * as the module path (must export `collectionSchemas`).
	 */
	watchSchemas?: boolean | string | readonly string[];
};

function asMutableCollections(
	collections: ZodDecapOptions["collections"],
): CollectionSpec[] {
	return [...collections];
}

function resolveWatchModules(
	root: string,
	watch: ZodDecapOptions["watchSchemas"],
	schemaOwnerHint: string | undefined,
): string[] {
	if (watch === undefined || watch === false) return [];
	const raw: string[] =
		watch === true
			? schemaOwnerHint
				? [schemaOwnerHint]
				: []
			: typeof watch === "string"
				? [watch]
				: [...watch];
	return raw.map((p) => resolvePath(root, p));
}

async function loadCollectionSchemas(
	modulePath: string,
): Promise<CollectionSpec[]> {
	const href = `${pathToFileURL(modulePath).href}?t=${Date.now()}`;
	const mod = (await import(/* @vite-ignore */ href)) as {
		collectionSchemas?: CollectionSpec[];
	};
	if (!Array.isArray(mod.collectionSchemas)) {
		throw new Error(`${modulePath} must export collectionSchemas array`);
	}
	return mod.collectionSchemas;
}

export function zodDecap(options: ZodDecapOptions): AstroIntegration {
	const startDecapServer = options.startDecapServer ?? true;
	const adminRoute = options.adminRoute ?? "/admin";
	let decapProc: ChildProcess | undefined;
	let projectRoot = "";

	const writeOpts = (
		root: string,
		collections: CollectionSpec[] = asMutableCollections(options.collections),
	): WriteDecapConfigOptions => ({
		root,
		collections,
		outFile: options.outFile,
		mediaFolder: options.mediaFolder,
		publicFolder: options.publicFolder,
		schemaOwnerHint: options.schemaOwnerHint,
	});

	return {
		name: "zod-decap-local",
		hooks: {
			"astro:config:setup": ({ command, config, injectRoute, logger }) => {
				const root = fileURLToPath(config.root);
				projectRoot = root;
				const result = writeDecapConfig(writeOpts(root));
				if (result.wrote) {
					logger.info(`Wrote ${options.outFile ?? "public/admin/config.yml"}`);
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

						const resolved = resolveDecapServer();
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
				const modules = resolveWatchModules(
					projectRoot,
					options.watchSchemas,
					options.schemaOwnerHint,
				);
				if (modules.length === 0) {
					if (options.watchSchemas === true && !options.schemaOwnerHint) {
						logger.warn(
							"watchSchemas: true needs schemaOwnerHint (path to the module exporting collectionSchemas).",
						);
					}
					return;
				}

				const primary = modules[0];
				for (const mod of modules) {
					server.watcher.add(mod);
				}

				const onChange = async (changed: string) => {
					const hit = modules.some(
						(m) => changed === m || resolvePath(changed) === m,
					);
					if (!hit) return;
					try {
						const collections = await loadCollectionSchemas(primary);
						const result = writeDecapConfig(
							writeOpts(projectRoot, collections),
						);
						if (result.wrote) {
							logger.info(
								`Regenerated ${options.outFile ?? "public/admin/config.yml"} (schema watch)`,
							);
						}
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
