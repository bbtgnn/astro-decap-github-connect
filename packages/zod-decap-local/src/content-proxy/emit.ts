/**
 * Emit adapter: concrete shim module paths for esbuild rewrites of
 * `astro:content` / `astro/loaders` during Decap emit.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function shimPaths() {
	const base = dirname(fileURLToPath(import.meta.url));
	const pick = (name: string) => {
		const candidates = [
			join(base, "shims", `${name}.js`),
			join(base, "shims", `${name}.ts`),
			// When bundled into dist/cli.js / dist/astro.js, shims sit under content-proxy/.
			join(base, "content-proxy", "shims", `${name}.js`),
			join(base, "content-proxy", "shims", `${name}.ts`),
		];
		const hit = candidates.find((p) => existsSync(p));
		if (!hit) {
			throw new Error(
				`Missing shim ${name} near ${base} (expected content-proxy/shims)`,
			);
		}
		return hit;
	};
	return {
		loaders: pick("astro-loaders"),
		content: pick("astro-content"),
	};
}
