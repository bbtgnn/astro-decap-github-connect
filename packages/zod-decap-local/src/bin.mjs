#!/usr/bin/env node
/**
 * Node-runnable CLI entry. Bundles TypeScript sources then runs the emit CLI.
 * Monorepo may still invoke `cli.ts` directly with Bun.
 */
import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "cli.ts");
// Keep outfile under `src/` so bundled `import.meta.url` still resolves `./shims/*`.
const outfile = join(here, "cli.bundled.mjs");
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
await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
