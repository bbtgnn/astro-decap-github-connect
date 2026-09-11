/**
 * Admin publish — sync pinned Decap CMS beside config.yml and bind shell URLs
 * (Astro base + outFile) in one place. Callers get final hrefs, not path fragments.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { DECAP_CMS_PIN } from "./pins";

export const CMS_BROWSER_FILENAME = "decap-cms.js";

function missingCmsMessage(detail?: string): string {
	return [
		`zod-decap-local could not find its pinned dependency decap-cms@${DECAP_CMS_PIN}`,
		detail ? `(${detail})` : null,
		"— expected dist/decap-cms.js from the installed package.",
		"Reinstall workspace deps (e.g. bun install) or reinstall zod-decap-local.",
	]
		.filter(Boolean)
		.join(" ");
}

/**
 * Resolve the browser build from the installed `decap-cms` package
 * (default: this module's dependency graph).
 */
export function resolveCmsBrowserBuild(
	requireFrom: string | URL = import.meta.url,
): string {
	try {
		const require = createRequire(requireFrom);
		const pkgJsonPath = require.resolve("decap-cms/package.json");
		const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
			main?: string;
		};
		const mainRel = pkg.main ?? `dist/${CMS_BROWSER_FILENAME}`;
		const src = join(dirname(pkgJsonPath), mainRel);
		if (!existsSync(src)) {
			throw new Error(missingCmsMessage(src));
		}
		return src;
	} catch (err) {
		if (err instanceof Error && err.message.startsWith("zod-decap-local")) {
			throw err;
		}
		throw new Error(missingCmsMessage());
	}
}

/** `public/admin/config.yml` → `admin/config.yml` (URL path under `base`). */
export function publicUrlPathFromOutFile(outFile: string): string {
	const normalized = outFile.replace(/\\/g, "/");
	const stripped = normalized.replace(/^\/?public\//, "");
	return stripped.replace(/^\//, "");
}

/** Sibling of config.yml, e.g. `admin/decap-cms.js`. */
export function cmsPublicPathFromOutFile(outFile: string): string {
	const configPath = publicUrlPathFromOutFile(outFile);
	const dir = dirname(configPath);
	if (dir === "." || dir === "") return CMS_BROWSER_FILENAME;
	return `${dir}/${CMS_BROWSER_FILENAME}`;
}

/** Join Astro `base` with a public path segment. */
export function withBaseUrl(base: string, publicPath: string): string {
	const b = base.endsWith("/") ? base : `${base}/`;
	const p = publicPath.replace(/^\//, "");
	return `${b}${p}`;
}

export type PublishAdminResult = {
	configHref: string;
	cmsHref: string;
	configPublicPath: string;
	cmsPublicPath: string;
	copied: boolean;
};

/**
 * Copy `decap-cms` browser build beside the generated config and resolve
 * config/script hrefs with Astro `base`. One call for sync + path policy.
 */
export function publishAdmin(options: {
	root: string;
	base: string;
	outFile?: string;
}): PublishAdminResult {
	const outFile = options.outFile ?? "public/admin/config.yml";
	const configPublicPath = publicUrlPathFromOutFile(outFile);
	const cmsPublicPath = cmsPublicPathFromOutFile(outFile);
	const dest = join(options.root, "public", cmsPublicPath);
	const src = resolveCmsBrowserBuild();
	mkdirSync(dirname(dest), { recursive: true });
	copyFileSync(src, dest);
	return {
		configPublicPath,
		cmsPublicPath,
		configHref: withBaseUrl(options.base, configPublicPath),
		cmsHref: withBaseUrl(options.base, cmsPublicPath),
		copied: true,
	};
}
