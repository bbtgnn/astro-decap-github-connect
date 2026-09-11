/**
 * Build compiled JS into `dist/` so Node (Astro’s process.execPath) can run the
 * CLI and import package exports without runtime TypeScript bundling.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const shared: esbuild.BuildOptions = {
	bundle: true,
	format: "esm",
	platform: "node",
	packages: "external",
	logLevel: "silent",
	target: "node22",
};

await Promise.all([
	esbuild.build({
		...shared,
		entryPoints: [join(root, "src/cli.ts")],
		outfile: join(dist, "cli.js"),
		banner: { js: "#!/usr/bin/env node" },
	}),
	esbuild.build({
		...shared,
		entryPoints: [join(root, "src/index.ts")],
		outfile: join(dist, "index.js"),
	}),
	esbuild.build({
		...shared,
		entryPoints: [join(root, "src/astro.ts")],
		outfile: join(dist, "astro.js"),
	}),
	// Emit / Vite resolve these as concrete files; bundle local imports (stamps, helpers).
	esbuild.build({
		...shared,
		entryPoints: [
			join(root, "src/content-proxy/shims/astro-loaders.ts"),
			join(root, "src/content-proxy/shims/astro-content.ts"),
		],
		outdir: join(dist, "content-proxy/shims"),
	}),
	// Boot live `astro:content` proxy imports stamp helpers from this module.
	esbuild.build({
		...shared,
		entryPoints: [join(root, "src/content-proxy/stamp-helpers.ts")],
		outfile: join(dist, "content-proxy/stamp-helpers.js"),
	}),
]);

cpSync(join(root, "src/admin.astro"), join(dist, "admin.astro"));

console.log("Built zod-decap-local → dist/");
