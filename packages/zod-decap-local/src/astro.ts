import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import {
	type CollectionSpec,
	type WriteDecapConfigOptions,
	writeDecapConfig,
} from "./codegen";

export type ZodDecapOptions = {
	collections: readonly CollectionSpec[] | CollectionSpec[];
	outFile?: string;
	adminRoute?: string;
	mediaFolder?: string;
	publicFolder?: string;
	schemaOwnerHint?: string;
	/** Spawn `decap-server` during `astro dev`. Default true. */
	startDecapServer?: boolean;
};

function asMutableCollections(
	collections: ZodDecapOptions["collections"],
): CollectionSpec[] {
	return [...collections];
}

export function zodDecap(options: ZodDecapOptions): AstroIntegration {
	const startDecapServer = options.startDecapServer ?? true;
	let decapProc: ChildProcess | undefined;

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
			"astro:config:setup": ({ command, config, injectRoute, logger }) => {
				const root = fileURLToPath(config.root);
				const result = writeDecapConfig(writeOpts(root));
				if (result.wrote) {
					logger.info(`Wrote ${options.outFile ?? "public/admin/config.yml"}`);
				}

				injectRoute({
					pattern: options.adminRoute ?? "/admin",
					entrypoint: new URL("./admin.astro", import.meta.url),
				});

				if (command === "dev" && startDecapServer && !decapProc) {
					decapProc = spawn("decap-server", [], {
						cwd: root,
						stdio: "inherit",
						shell: true,
						env: process.env,
					});
					decapProc.on("error", (err) => {
						logger.error(
							`Failed to start decap-server (${err.message}). Is peer dep decap-server@3.11.0 installed?`,
						);
					});
					const stop = () => {
						decapProc?.kill();
						decapProc = undefined;
					};
					process.on("exit", stop);
					process.on("SIGINT", stop);
					process.on("SIGTERM", stop);
					logger.info("Started decap-server for local_backend");
				}
			},
		},
	};
}
