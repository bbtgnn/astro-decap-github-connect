/**
 * Bundle `cli.ts` to plain ESM so Astro’s Node (or any) runtime can spawn emit
 * without requiring Bun. Local files are inlined; packages stay external.
 */
import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function ensureCliBundle(): string {
	const src = fileURLToPath(new URL("./cli.ts", import.meta.url));
	// Keep outfile under `src/` so bundled `import.meta.url` still resolves `./shims/*`.
	const outfile = fileURLToPath(new URL("./cli.bundled.mjs", import.meta.url));
	mkdirSync(dirname(outfile), { recursive: true });
	esbuild.buildSync({
		entryPoints: [src],
		bundle: true,
		outfile,
		format: "esm",
		platform: "node",
		packages: "external",
		logLevel: "silent",
	});
	return outfile;
}
