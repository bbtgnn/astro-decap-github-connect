/**
 * Content-config path discovery (Astro app root → content.config file).
 * Boot / emit Astro content proxy adapters live under `./content-proxy/`.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

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
