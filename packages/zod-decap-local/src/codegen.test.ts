import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	buildDecapConfig,
	collectionFromSchema,
	fieldFromZod,
} from "./codegen";
import { boolean, object, relation, text } from "./fields";

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

	test("maps relation helper to Decap relation widget options", () => {
		const field = fieldFromZod(
			"author",
			relation("authors", {
				label: "Author",
				searchFields: ["name"],
				displayFields: ["name"],
			}).optional(),
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
			object(
				{
					website: text({ label: "Website" }).optional(),
					bluesky: text({ label: "Bluesky" }).optional(),
				},
				{ label: "Social" },
			).optional(),
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

	test("emits local_backend.url when an optional override is set", () => {
		const schema = object(
			{ title: text({ label: "Title" }) },
			{ collection: { folder: "src/content/posts" } },
		);
		const yaml = buildDecapConfig({
			collections: [{ name: "posts", schema }],
			localBackendUrl: "http://127.0.0.1:8081/api/v1",
		});
		expect(yaml).toMatch(/url: http:\/\/127\.0\.0\.1:8081\/api\/v1/);
		expect(yaml).not.toMatch(/local_backend: true/);
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
