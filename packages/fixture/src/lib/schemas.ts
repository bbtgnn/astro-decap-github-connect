/**
 * Shared collection schemas — imported by `content.config.ts` and Decap codegen.
 * Do not put Astro-only imports here.
 */
import { z } from "zod";
import {
	boolean,
	datetime,
	image,
	number,
	object,
	relation,
	select,
	text,
} from "zod-decap-local";

/**
 * Frontmatter-only schema for Astro Content Layer.
 * Markdown below the fence is the entry body (not a Zod field).
 * Codegen appends Decap’s conventional `body` markdown widget.
 */
export const postsSchema = object(
	{
		title: text({ label: "Title" }),
		description: text({ label: "Description" }).optional(),
		pubDate: datetime({ label: "Publish Date" }),
		draft: boolean({ label: "Draft", default: false }),
		heroImage: image({ label: "Hero Image" }).optional(),
		author: relation("authors", {
			label: "Author",
			searchFields: ["name"],
			displayFields: ["name"],
		}).optional(),
		tags: z
			.array(z.string())
			.default([])
			.meta({
				ui: {
					widget: "list",
					label: "Tags",
					options: {
						field: { name: "tag", label: "Tag", widget: "string" },
					},
				},
			}),
		status: select(["draft", "published", "archived"] as const, {
			label: "Status",
		}).default("draft"),
	},
	{
		label: "Posts",
		collection: {
			label: "Blog Posts",
			folder: "src/content/posts",
			extension: "md",
			format: "frontmatter",
			create: true,
		},
	},
);

/** YAML folder collection — no markdown body. */
export const authorsSchema = object(
	{
		name: text({ label: "Name" }),
		role: select(["editor", "writer", "guest"] as const, {
			label: "Role",
		}).default("writer"),
		bio: text({ label: "Bio" }).optional(),
		avatar: image({ label: "Avatar" }).optional(),
		order: number({ label: "Sort order" }).default(0),
		social: object(
			{
				website: text({ label: "Website" }).optional(),
				bluesky: text({ label: "Bluesky" }).optional(),
			},
			{ label: "Social" },
		).optional(),
	},
	{
		label: "Authors",
		collection: {
			label: "Authors",
			folder: "src/content/authors",
			extension: "yml",
			format: "yaml",
			create: true,
		},
	},
);

/** Simple markdown pages. */
export const pagesSchema = object(
	{
		title: text({ label: "Title" }),
		description: text({ label: "Description" }).optional(),
		draft: boolean({ label: "Draft", default: false }),
	},
	{
		label: "Pages",
		collection: {
			label: "Pages",
			folder: "src/content/pages",
			extension: "md",
			format: "frontmatter",
			create: true,
		},
	},
);

export type Post = z.infer<typeof postsSchema>;
export type Author = z.infer<typeof authorsSchema>;
export type Page = z.infer<typeof pagesSchema>;

/** Registry for Decap codegen — keep in sync with `content.config.ts`. */
export const collectionSchemas = [
	{ name: "authors", schema: authorsSchema },
	{ name: "posts", schema: postsSchema },
	{ name: "pages", schema: pagesSchema },
] as const;
