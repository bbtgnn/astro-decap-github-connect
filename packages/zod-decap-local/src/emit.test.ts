import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { LOADER_STAMP, stampLoader } from "./content-proxy/stamps";
import { buildDecapConfig, collectionFromSchema, fieldFromZod } from "./emit";
import {
	astroImageSchema,
	decapPathToAstroImage,
	imagePathForDecap,
} from "./image-bridge";
import { collectionOptions, fieldOptions } from "./meta";

describe("fieldFromZod", () => {
	test("maps string + label meta to Decap string widget", () => {
		const field = fieldFromZod(
			"title",
			z.string().meta(fieldOptions({ label: "Title" })),
		);
		expect(field.widget).toBe("string");
		expect(field.label).toBe("Title");
		expect(field.name).toBe("title");
	});

	test("marks optional fields required: false", () => {
		const field = fieldFromZod(
			"description",
			z
				.string()
				.meta(fieldOptions({ label: "Description" }))
				.optional(),
		);
		expect(field.required).toBe(false);
	});

	test("emits boolean default", () => {
		const field = fieldFromZod(
			"draft",
			z
				.boolean()
				.default(false)
				.meta(fieldOptions({ label: "Draft" })),
		);
		expect(field.widget).toBe("boolean");
		expect(field.default).toBe(false);
	});

	test("maps relation fieldOptions to Decap relation widget", () => {
		const field = fieldFromZod(
			"author",
			z
				.string()
				.meta(
					fieldOptions({
						widget: "relation",
						label: "Author",
						relation: {
							collection: "authors",
							searchFields: ["name"],
							displayFields: ["name"],
						},
					}),
				)
				.optional(),
		);
		expect(field).toEqual({
			name: "author",
			label: "Author",
			widget: "relation",
			required: false,
			collection: "authors",
			value_field: "{{slug}}",
			search_fields: ["name"],
			display_fields: ["name"],
		});
	});

	test("maps nested object to Decap object widget with child fields", () => {
		const field = fieldFromZod(
			"social",
			z
				.object({
					website: z
						.string()
						.meta(fieldOptions({ label: "Website" }))
						.optional(),
					bluesky: z
						.string()
						.meta(fieldOptions({ label: "Bluesky" }))
						.optional(),
				})
				.meta(fieldOptions({ label: "Social" }))
				.optional(),
		);
		expect(field).toEqual({
			name: "social",
			label: "Social",
			widget: "object",
			required: false,
			fields: [
				{
					name: "website",
					label: "Website",
					widget: "string",
					required: false,
				},
				{
					name: "bluesky",
					label: "Bluesky",
					widget: "string",
					required: false,
				},
			],
		});
	});

	test("rejects incompatible widget / Zod kind", () => {
		expect(() =>
			fieldFromZod("n", z.number().meta(fieldOptions({ widget: "markdown" }))),
		).toThrow(/incompatible/);
	});
});

describe("collectionFromSchema", () => {
	test("uses loader stamp for folder/extension and appends body", () => {
		const schema = z
			.object({
				title: z.string().meta(fieldOptions({ label: "Title" })),
			})
			.meta(collectionOptions({ label: "Blog Posts" }));
		const loader = stampLoader(
			{ name: "glob-loader", load: async () => {} },
			{
				kind: "glob",
				pattern: "**/*.{md,mdx}",
				base: "./src/content/posts",
			},
		);
		const col = collectionFromSchema("posts", schema, loader);
		expect(col.name).toBe("posts");
		expect(col.label).toBe("Blog Posts");
		expect(col.folder).toBe("src/content/posts");
		expect(col.extension).toBe("md");
		expect(col.format).toBe("frontmatter");
		expect(col.fields).toEqual([
			{ name: "title", label: "Title", widget: "string" },
			{ name: "body", label: "Body", widget: "markdown" },
		]);
		expect(loader[LOADER_STAMP]?.kind).toBe("glob");
	});
});

describe("buildDecapConfig", () => {
	test("includes local_backend + generated banner", () => {
		const schema = z
			.object({
				title: z.string().meta(fieldOptions({ label: "Title" })),
			})
			.meta(
				collectionOptions({
					folder: "src/content/posts",
					extension: "md",
					format: "frontmatter",
				}),
			);
		const yaml = buildDecapConfig({
			collections: [{ name: "posts", schema }],
		});
		expect(yaml).toMatch(/GENERATED FILE/);
		expect(yaml).toMatch(/local_backend: true/);
		expect(yaml).toMatch(/name: git-gateway/);
		expect(yaml).toMatch(/media_folder: public\/images/);
		expect(yaml).not.toMatch(/auth_endpoint/);
	});
});

describe("zod meta round-trip", () => {
	test("preserves widget on nested default wrappers", () => {
		const schema = z
			.boolean()
			.default(false)
			.meta(fieldOptions({ widget: "boolean", label: "Draft" }));
		const field = fieldFromZod("draft", schema);
		expect(field.widget).toBe("boolean");
		expect(field.label).toBe("Draft");
	});
});

describe("astro image bridge", () => {
	test("astroImageSchema emits a single Decap image widget", () => {
		const field = fieldFromZod("hero", astroImageSchema());
		expect(field).toEqual({
			name: "hero",
			label: "hero",
			widget: "image",
		});
		expect(field.fields).toBeUndefined();
	});

	test("imagePathForDecap and decapPathToAstroImage round-trip path", () => {
		expect(imagePathForDecap("images/x.png")).toBe("/images/x.png");
		expect(
			imagePathForDecap({
				src: "foo.jpg",
				width: 1,
				height: 1,
				format: "jpg",
			}),
		).toBe("/foo.jpg");
		expect(decapPathToAstroImage("images/x.png")).toEqual({
			src: "/images/x.png",
			width: 0,
			height: 0,
			format: "png",
		});
	});
});

describe("writeDecapConfig skip-unchanged", () => {
	test("returns wrote:false when yaml matches disk", async () => {
		const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } =
			await import("node:fs");
		const { join } = await import("node:path");
		const { tmpdir } = await import("node:os");
		const { writeDecapConfig } = await import("./emit");

		const root = mkdtempSync(join(tmpdir(), "zod-decap-"));
		mkdirSync(join(root, "public/admin"), { recursive: true });
		const collections = [
			{
				name: "posts",
				schema: z
					.object({
						title: z.string().meta(fieldOptions({ label: "Title" })),
					})
					.meta(
						collectionOptions({
							folder: "src/content/posts",
							extension: "md",
							format: "frontmatter",
						}),
					),
			},
		];
		const first = writeDecapConfig({ root, collections });
		expect(first.wrote).toBe(true);
		const second = writeDecapConfig({ root, collections });
		expect(second.wrote).toBe(false);
		expect(readFileSync(join(root, "public/admin/config.yml"), "utf8")).toBe(
			first.yaml,
		);
		writeFileSync(join(root, "public/admin/config.yml"), "stale\n");
		const third = writeDecapConfig({ root, collections });
		expect(third.wrote).toBe(true);
	});
});
