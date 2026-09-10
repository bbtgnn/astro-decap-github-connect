import { resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AstroIntegration } from "astro";
import {
	type CollectionSpec,
	type WriteDecapConfigOptions,
	writeDecapConfig,
} from "./codegen";
import {
	DEFAULT_DECAP_PROXY_PORT,
	ensureLocalDecapSession,
	getLocalDecapSessionPort,
	localBackendUrl,
	type EnsureResult,
} from "./session";

export type ZodDecapOptions = {
	collections: readonly CollectionSpec[] | CollectionSpec[];
	outFile?: string;
	adminRoute?: string;
	mediaFolder?: string;
	publicFolder?: string;
	schemaOwnerHint?: string;
	/** Ensure local Decap session during `astro dev`. Default true. */
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

function logEnsureResult(
	logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void },
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
		const portNote =
			result.port === DEFAULT_DECAP_PROXY_PORT
				? `:${result.port}`
				: `:${result.port} (8081 busy; config local_backend.url aligned)`;
		logger.info(
			`Started decap-server@${result.version} for local_backend on ${portNote}`,
		);
		return;
	}
	logger.error(result.message);
}

export function zodDecap(options: ZodDecapOptions): AstroIntegration {
	const startDecapServer = options.startDecapServer ?? true;
	const adminRoute = options.adminRoute ?? "/admin";
	let projectRoot = "";

	const writeOpts = (
		root: string,
		collections: CollectionSpec[] = asMutableCollections(options.collections),
		localBackend?: string,
	): WriteDecapConfigOptions => ({
		root,
		collections,
		outFile: options.outFile,
		mediaFolder: options.mediaFolder,
		publicFolder: options.publicFolder,
		schemaOwnerHint: options.schemaOwnerHint,
		localBackendUrl: localBackend,
	});

	return {
		name: "zod-decap-local",
		hooks: {
			"astro:config:setup": ({ command, config, injectRoute, logger }) => {
				const root = fileURLToPath(config.root);
				projectRoot = root;

				injectRoute({
					pattern: adminRoute,
					entrypoint: new URL("./admin.astro", import.meta.url),
				});

				if (command === "dev" && startDecapServer) {
					void (async () => {
						const result = await ensureLocalDecapSession({
							cwd: root,
							alignConfig: (port) => {
								const written = writeDecapConfig(
									writeOpts(root, undefined, localBackendUrl(port)),
								);
								if (written.wrote) {
									logger.info(
										`Wrote ${options.outFile ?? "public/admin/config.yml"} (proxy :${port})`,
									);
								}
							},
						});
						logEnsureResult(logger, result);
					})();
				} else {
					const result = writeDecapConfig(writeOpts(root));
					if (result.wrote) {
						logger.info(
							`Wrote ${options.outFile ?? "public/admin/config.yml"}`,
						);
					}
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
						const port =
							getLocalDecapSessionPort() ?? DEFAULT_DECAP_PROXY_PORT;
						const result = writeDecapConfig(
							writeOpts(
								projectRoot,
								collections,
								localBackendUrl(port),
							),
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
