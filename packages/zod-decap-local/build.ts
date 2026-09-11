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
	// Emit / Vite resolve these as concrete files; bundle local imports (meta, stamps).
	esbuild.build({
		...shared,
		entryPoints: [
			join(root, "src/shims/astro-loaders.ts"),
			join(root, "src/shims/astro-content.ts"),
		],
		outdir: join(dist, "shims"),
	}),
	// Boot `astro:content` proxy imports fieldOptions from this sibling module.
	esbuild.build({
		...shared,
		entryPoints: [join(root, "src/meta.ts")],
		outfile: join(dist, "meta.js"),
	}),
]);

cpSync(join(root, "src/admin.astro"), join(dist, "admin.astro"));

console.log("Built zod-decap-local → dist/");
