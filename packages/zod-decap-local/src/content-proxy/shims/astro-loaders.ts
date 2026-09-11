/**
 * Passthrough Astro loaders that stamp `base` / `pattern` for Decap emit.
 * Aliased over `astro/loaders` at boot and resolved into the emit bundle.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { file as AstroFile, glob as AstroGlob } from "astro/loaders";
import { stampLoader } from "../stamps";

type RealLoaders = {
	glob: typeof AstroGlob;
	file: typeof AstroFile;
};

function loadRealLoaders(): RealLoaders {
	// Prefer the app cwd (fixture) so nested emit / Vite resolve the consumer's astro.
	const require = createRequire(join(process.cwd(), "package.json"));
	const astroEntry = require.resolve("astro/package.json");
	const loadersJs = join(dirname(astroEntry), "dist/content/loaders/index.js");
	return require(loadersJs) as RealLoaders;
}

const real = loadRealLoaders();

function baseAsString(base: unknown): string | undefined {
	if (typeof base === "string") return base;
	if (base instanceof URL) return base.href;
	return undefined;
}

export function glob(...args: Parameters<typeof AstroGlob>) {
	const opts = args[0];
	const loader = real.glob(...args);
	return stampLoader(loader, {
		kind: "glob",
		pattern: opts.pattern,
		base: baseAsString(opts.base),
	});
}

export function file(...args: Parameters<typeof AstroFile>) {
	const [fileName] = args;
	const loader = real.file(...args);
	return stampLoader(loader, {
		kind: "file",
		fileName,
	});
}
