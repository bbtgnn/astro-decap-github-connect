/**
 * Bundle + import an Astro content.config outside Vite.
 * Rewrites `astro:content` / `astro/loaders` to our emit shims, then dynamic-imports
 * the result. Implementation detail of `load-content-config`.
 */
import * as esbuild from "esbuild";
import { mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

	// Package root (stable when this module is bundled beside `src/`).
	const pkgDir = fileURLToPath(new URL("..", import.meta.url));

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
					// Bundle workspace package (Node cannot load extensionless .ts exports).
					build.onResolve({ filter: /^zod-decap-local$/ }, () => ({
						path: join(pkgDir, "src/index.ts"),
					}));
					build.onResolve({ filter: /^zod-decap-local\/(.+)$/ }, (args) => {
						const sub = args.path.slice("zod-decap-local/".length);
						const file =
							sub === "astro"
								? "src/astro.ts"
								: sub === "admin"
									? "src/admin.astro"
									: `src/${sub}.ts`;
						return { path: join(pkgDir, file) };
					});
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
