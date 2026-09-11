/**
 * Publish vendored Decap CMS assets next to generated config.yml under the app `public/`.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DECAP_CMS_PIN } from "./pins";

const vendorDir = fileURLToPath(new URL("../vendor/", import.meta.url));

export const VENDORED_CMS_FILENAME = "decap-cms.js";

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
	if (dir === "." || dir === "") return VENDORED_CMS_FILENAME;
	return `${dir}/${VENDORED_CMS_FILENAME}`;
}

export function vendorCmsSourcePath(): string {
	return join(vendorDir, VENDORED_CMS_FILENAME);
}

/**
 * Copy vendored `decap-cms.js` beside the generated config under `root`.
 * Returns the public URL path (no leading slash, no `base` prefix).
 */
export function syncVendoredCms(options: {
	root: string;
	outFile?: string;
}): { cmsPublicPath: string; configPublicPath: string; copied: boolean } {
	const outFile = options.outFile ?? "public/admin/config.yml";
	const configPublicPath = publicUrlPathFromOutFile(outFile);
	const cmsPublicPath = cmsPublicPathFromOutFile(outFile);
	const dest = join(options.root, "public", cmsPublicPath);
	const src = vendorCmsSourcePath();
	if (!existsSync(src)) {
		throw new Error(
			`Vendored Decap CMS build missing (${src}). Expected decap-cms@${DECAP_CMS_PIN} at packages/zod-decap-local/vendor/${VENDORED_CMS_FILENAME}.`,
		);
	}
	mkdirSync(dirname(dest), { recursive: true });
	copyFileSync(src, dest);
	return { cmsPublicPath, configPublicPath, copied: true };
}

/** Join Astro `base` with a public path segment. */
export function withBaseUrl(base: string, publicPath: string): string {
	const b = base.endsWith("/") ? base : `${base}/`;
	const p = publicPath.replace(/^\//, "");
	return `${b}${p}`;
}
