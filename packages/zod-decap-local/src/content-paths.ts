/**
 * Content-config path discovery + Vite boot aliases (no esbuild).
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
	const loaders = fileURLToPath(
		new URL("./shims/astro-loaders.ts", import.meta.url),
	);
	const content = fileURLToPath(
		new URL("./shims/astro-content.ts", import.meta.url),
	);
	return { loaders, content };
}

/** Boot-time aliases — do not replace Astro’s virtual `astro:content`. */
export function viteAliasesForBoot(): {
	find: string | RegExp;
	replacement: string;
}[] {
	const { loaders } = shimPaths();
	return [{ find: /^astro\/loaders$/, replacement: loaders }];
}
