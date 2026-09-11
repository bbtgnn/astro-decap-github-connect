/**
 * Private to Decap emit: bundle + import content.config outside Vite.
 * Rewrites `astro:content` / `astro/loaders` to emit shims, then dynamic-imports
 * the result. Implementation detail of `load-content-config`.
 */
import * as esbuild from "esbuild";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { shimPaths } from "../content-paths";

/** Package root whether this file lives under `src/` or `src/emit/`, or is bundled to `src/*.mjs`. */
function packageRoot(fromImportMetaUrl: string): string {
	let dir = dirname(fileURLToPath(fromImportMetaUrl));
	for (;;) {
		if (existsSync(join(dir, "package.json"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) {
			throw new Error("Could not find zod-decap-local package root");
		}
		dir = parent;
	}
}

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

	const pkgDir = packageRoot(import.meta.url);

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
