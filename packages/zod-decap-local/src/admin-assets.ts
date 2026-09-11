/**
 * Admin publish — sync vendored CMS beside config.yml and bind shell URLs
 * (Astro base + outFile) in one place. Callers get final hrefs, not path fragments.
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
 * Copy vendored `decap-cms.js` beside the generated config and resolve
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
	const src = vendorCmsSourcePath();
	if (!existsSync(src)) {
		throw new Error(
			`Vendored Decap CMS build missing (${src}). Expected decap-cms@${DECAP_CMS_PIN} at packages/zod-decap-local/vendor/${VENDORED_CMS_FILENAME}.`,
		);
	}
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
