import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	buildDecapConfig,
	collectionFromSchema,
	fieldFromZod,
} from "./codegen";
import { boolean, object, text } from "./fields";

describe("fieldFromZod", () => {
	test("maps string + label meta to Decap string widget", () => {
		const field = fieldFromZod("title", text({ label: "Title" }));
		expect(field.widget).toBe("string");
		expect(field.label).toBe("Title");
		expect(field.name).toBe("title");
	});

	test("marks optional fields required: false", () => {
		const field = fieldFromZod(
			"description",
			text({ label: "Description" }).optional(),
		);
		expect(field.required).toBe(false);
	});

	test("emits boolean default", () => {
		const field = fieldFromZod(
			"draft",
			boolean({ label: "Draft", default: false }),
		);
		expect(field.widget).toBe("boolean");
		expect(field.default).toBe(false);
	});
});

describe("collectionFromSchema", () => {
	test("emits folder collection from collection meta + body", () => {
		const schema = object(
			{ title: text({ label: "Title" }) },
			{
				collection: {
					label: "Blog Posts",
					folder: "src/content/posts",
					extension: "md",
					format: "frontmatter",
					create: true,
				},
			},
		);
		const col = collectionFromSchema("posts", schema);
		expect(col.name).toBe("posts");
		expect(col.label).toBe("Blog Posts");
		expect(col.folder).toBe("src/content/posts");
		expect(col.fields).toEqual([
			{ name: "title", label: "Title", widget: "string" },
			{ name: "body", label: "Body", widget: "markdown" },
		]);
	});
});

describe("buildDecapConfig", () => {
	test("includes local_backend + generated banner", () => {
		const schema = object(
			{ title: text({ label: "Title" }) },
			{ collection: { folder: "src/content/posts" } },
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
			.meta({ ui: { widget: "boolean", label: "Draft" } });
		const field = fieldFromZod("draft", schema);
		expect(field.widget).toBe("boolean");
		expect(field.label).toBe("Draft");
	});
});
