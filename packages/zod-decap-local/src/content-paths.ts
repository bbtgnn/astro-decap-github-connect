/**
 * Content-config path discovery + Vite boot aliases / plugins (no esbuild).
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { astroContentBootProxy } from "./vite-astro-content-proxy";

const CONTENT_CONFIG_CANDIDATES = [
	"src/content.config.ts",
	"src/content.config.mjs",
	"src/content.config.js",
	"src/content.config.mts",
] as const;

export function resolveContentConfigPath(
	root: string,
	override?: string,
): string {
	if (override) return resolve(root, override);
	for (const rel of CONTENT_CONFIG_CANDIDATES) {
		const abs = join(root, rel);
		if (existsSync(abs)) return abs;
	}
	throw new Error(
		`No content config found under ${root} (expected src/content.config.ts). Pass contentConfig to zodDecap.`,
	);
}

export function shimPaths() {
	const base = dirname(fileURLToPath(import.meta.url));
	const pick = (name: string) => {
		const js = join(base, "shims", `${name}.js`);
		const ts = join(base, "shims", `${name}.ts`);
		if (existsSync(js)) return js;
		if (existsSync(ts)) return ts;
		throw new Error(`Missing shim ${name} under ${base}/shims`);
	};
	return {
		loaders: pick("astro-loaders"),
		content: pick("astro-content"),
	};
}

/** Boot-time aliases for `astro/loaders` (stamp glob/file inputs). */
export function viteAliasesForBoot(): {
	find: string | RegExp;
	replacement: string;
}[] {
	const { loaders } = shimPaths();
	return [{ find: /^astro\/loaders$/, replacement: loaders }];
}

/** Boot-time Vite plugins — live `astro:content` proxy for reference/image meta. */
export function vitePluginsForBoot() {
	return [astroContentBootProxy()];
}
