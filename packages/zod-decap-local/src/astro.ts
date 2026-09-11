import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { publishAdmin } from "./admin-assets";
import {
	type CollectionSpec,
	type WriteDecapConfigOptions,
	writeDecapConfig,
} from "./codegen";
import { ensureLocalDecapSession, type EnsureResult } from "./session";

export type ZodDecapOptions = {
	collections: readonly CollectionSpec[] | CollectionSpec[];
	outFile?: string;
	adminRoute?: string;
	mediaFolder?: string;
	publicFolder?: string;
	schemaOwnerHint?: string;
	/** Ensure local Decap session during `astro dev`. Default true. */
	startDecapServer?: boolean;
};

function asMutableCollections(
	collections: ZodDecapOptions["collections"],
): CollectionSpec[] {
	return [...collections];
}

function logEnsureResult(
	logger: {
		info: (m: string) => void;
		warn: (m: string) => void;
		error: (m: string) => void;
	},
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

export function zodDecap(options: ZodDecapOptions): AstroIntegration {
	const startDecapServer = options.startDecapServer ?? true;
	const adminRoute = options.adminRoute ?? "/admin";

	const writeOpts = (root: string): WriteDecapConfigOptions => ({
		root,
		collections: asMutableCollections(options.collections),
		outFile: options.outFile,
		mediaFolder: options.mediaFolder,
		publicFolder: options.publicFolder,
		schemaOwnerHint: options.schemaOwnerHint,
	});

	return {
		name: "zod-decap-local",
		hooks: {
			"astro:config:setup": ({
				command,
				config,
				injectRoute,
				logger,
				updateConfig,
			}) => {
				const root = fileURLToPath(config.root);

				const assets = publishAdmin({
					root,
					base: config.base,
					outFile: options.outFile,
				});
				updateConfig({
					vite: {
						define: {
							"import.meta.env.PUBLIC_ZOD_DECAP_CONFIG_HREF": JSON.stringify(
								assets.configHref,
							),
							"import.meta.env.PUBLIC_ZOD_DECAP_CMS_HREF": JSON.stringify(
								assets.cmsHref,
							),
						},
					},
				});
				logger.info(
					`Published Decap admin assets → ${assets.cmsHref}`,
				);

				injectRoute({
					pattern: adminRoute,
					entrypoint: new URL("./admin.astro", import.meta.url),
				});

				const written = writeDecapConfig(writeOpts(root));
				if (written.wrote) {
					logger.info(
						`Wrote ${options.outFile ?? "public/admin/config.yml"}`,
					);
				}

				if (command === "dev" && startDecapServer) {
					void ensureLocalDecapSession({ cwd: root }).then((result) => {
						logEnsureResult(logger, result);
					});
				}
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
