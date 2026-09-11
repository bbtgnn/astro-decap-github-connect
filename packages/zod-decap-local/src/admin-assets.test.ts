import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	cmsPublicPathFromOutFile,
	publicUrlPathFromOutFile,
	publishAdmin,
	resolveCmsBrowserBuild,
	withBaseUrl,
} from "./admin-assets";

describe("admin asset paths", () => {
	test("strips public/ for config URL path", () => {
		expect(publicUrlPathFromOutFile("public/admin/config.yml")).toBe(
			"admin/config.yml",
		);
		expect(publicUrlPathFromOutFile("public/cms/config.yml")).toBe(
			"cms/config.yml",
		);
	});

	test("places CMS script beside config", () => {
		expect(cmsPublicPathFromOutFile("public/admin/config.yml")).toBe(
			"admin/decap-cms.js",
		);
	});

	test("joins Astro base", () => {
		expect(withBaseUrl("/", "admin/config.yml")).toBe("/admin/config.yml");
		expect(withBaseUrl("/repo/", "admin/config.yml")).toBe(
			"/repo/admin/config.yml",
		);
		expect(withBaseUrl("/repo", "admin/decap-cms.js")).toBe(
			"/repo/admin/decap-cms.js",
		);
	});

	test("resolveCmsBrowserBuild finds dist/decap-cms.js from npm pin", () => {
		const src = resolveCmsBrowserBuild();
		expect(existsSync(src)).toBe(true);
		expect(src.replace(/\\/g, "/")).toMatch(/decap-cms[/].*decap-cms\.js$/);
	});

	test("publishAdmin syncs npm CMS build and returns base-joined hrefs", () => {
		const root = mkdtempSync(join(tmpdir(), "zod-decap-admin-"));
		try {
			const published = publishAdmin({
				root,
				base: "/site/",
				outFile: "public/admin/config.yml",
			});
			expect(published.configHref).toBe("/site/admin/config.yml");
			expect(published.cmsHref).toBe("/site/admin/decap-cms.js");
			expect(
				existsSync(join(root, "public", "admin", "decap-cms.js")),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
