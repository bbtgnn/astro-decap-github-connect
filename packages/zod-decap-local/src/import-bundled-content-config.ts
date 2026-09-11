/**
 * Bundle + import an Astro content.config outside Vite.
 * Rewrites `astro:content` / `astro/loaders` to our emit shims, then dynamic-imports
 * the result. Implementation detail of `load-content-config`.
 */
import * as esbuild from "esbuild";
import { mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { shimPaths } from "./content-paths";

export async function importBundledContentConfig<T extends Record<string, unknown>>(
	options: {
		root: string;
		contentConfigPath: string;
	},
): Promise<T> {
	const { loaders, content } = shimPaths();
	const outfile = join(
		options.root,
		"node_modules",
		".cache",
		"zod-decap-local",
		`content-config-${process.pid}.mjs`,
	);
	mkdirSync(dirname(outfile), { recursive: true });

	await esbuild.build({
		absWorkingDir: options.root,
		entryPoints: [options.contentConfigPath],
		bundle: true,
		outfile,
		format: "esm",
		platform: "node",
		packages: "external",
		logLevel: "silent",
		plugins: [
			{
				name: "zod-decap-aliases",
				setup(build) {
					build.onResolve({ filter: /^astro:content$/ }, () => ({
						path: content,
					}));
					build.onResolve({ filter: /^astro\/loaders$/ }, () => ({
						path: loaders,
					}));
				},
			},
		],
	});

	try {
		// Runtime import — avoid static analysis rewriting this path.
		const nativeImport = new Function(
			"u",
			"return import(u)",
		) as (u: string) => Promise<T>;
		return await nativeImport(
			`${pathToFileURL(outfile).href}?t=${Date.now()}`,
		);
	} finally {
		try {
			unlinkSync(outfile);
		} catch {
			/* ignore */
		}
	}
}
