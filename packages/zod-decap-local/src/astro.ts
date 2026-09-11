/**
 * Thin Astro adapter: path resolve, content-proxy Vite wiring, admin route,
 * and hooks that delegate local editorial runtime to the session module.
 */

import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { resolveContentConfigPath } from "./content-paths";
import { viteAliasesForBoot, vitePluginsForBoot } from "./content-proxy/boot";
import {
	createEditorialSession,
	type EditorialSessionOptions,
} from "./session";

export type ZodDecapOptions = EditorialSessionOptions & {
	adminRoute?: string;
	/** Spawn `decap-server` during `astro dev`. Default true. */
	startDecapServer?: boolean;
};

export function zodDecap(options: ZodDecapOptions = {}): AstroIntegration {
	const startDecapServer = options.startDecapServer ?? true;
	const adminRoute = options.adminRoute ?? "/admin";
	let session: ReturnType<typeof createEditorialSession> | undefined;

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
				const contentConfigAbs = resolveContentConfigPath(
					root,
					options.contentConfig,
				);
				session = createEditorialSession(root, contentConfigAbs, options);

				updateConfig({
					vite: {
						resolve: {
							alias: viteAliasesForBoot(),
						},
						plugins: vitePluginsForBoot(),
					},
				});

				try {
					const { wrote } = session.emit();
					if (wrote) {
						logger.info(
							`Wrote ${options.outFile ?? "public/admin/config.yml"}`,
						);
					}
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
					void session.ensureDecapServer(logger);
				}
			},
			"astro:server:setup": ({ server, logger }) => {
				session?.attachWatch(server.watcher, logger);
			},
			"astro:server:start": ({ address, logger }) => {
				session?.logAdminUrl(address, adminRoute, logger);
			},
		},
	};
}
