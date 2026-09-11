import { describe, expect, test } from "bun:test";
import {
	cmsPublicPathFromOutFile,
	publicUrlPathFromOutFile,
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
});
