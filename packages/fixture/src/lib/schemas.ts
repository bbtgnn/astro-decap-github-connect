/**
 * Frontmatter-only schema for Astro Content Layer.
 * Markdown below the fence is the entry body (not a Zod field).
 * Decap emit appends the conventional `body` markdown widget.
 */
import { z } from "zod";
import { collectionOptions, fieldOptions } from "zod-decap-local";

export const postsSchema = z
	.object({
		title: z.string().meta(fieldOptions({ label: "Title" })),
		description: z
			.string()
			.meta(fieldOptions({ label: "Description" }))
			.optional(),
		pubDate: z.coerce.date().meta(fieldOptions({ label: "Publish Date" })),
		draft: z
			.boolean()
			.default(false)
			.meta(fieldOptions({ label: "Draft" })),
		heroImage: z
			.string()
			.meta(fieldOptions({ widget: "image", label: "Hero Image" }))
			.optional(),
		author: z
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
		tags: z
			.array(z.string().meta(fieldOptions({ label: "Tag" })))
			.default([])
			.meta(fieldOptions({ widget: "list", label: "Tags" })),
		status: z
			.enum(["draft", "published", "archived"])
			.default("draft")
			.meta(fieldOptions({ label: "Status" })),
	})
	.meta(
		collectionOptions({
			label: "Blog Posts",
		}),
	);

/** YAML folder collection — no markdown body. */
export const authorsSchema = z
	.object({
		name: z.string().meta(fieldOptions({ label: "Name" })),
		role: z
			.enum(["editor", "writer", "guest"])
			.default("writer")
			.meta(fieldOptions({ label: "Role" })),
		bio: z.string().meta(fieldOptions({ label: "Bio" })).optional(),
		avatar: z
			.string()
			.meta(fieldOptions({ widget: "image", label: "Avatar" }))
			.optional(),
		order: z.number().default(0).meta(fieldOptions({ label: "Sort order" })),
		social: z
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
	})
	.meta(collectionOptions({ label: "Authors" }));

/** Simple markdown pages. */
export const pagesSchema = z
	.object({
		title: z.string().meta(fieldOptions({ label: "Title" })),
		description: z
			.string()
			.meta(fieldOptions({ label: "Description" }))
			.optional(),
		draft: z
			.boolean()
			.default(false)
			.meta(fieldOptions({ label: "Draft" })),
	})
	.meta(collectionOptions({ label: "Pages" }));

export type Post = z.infer<typeof postsSchema>;
export type Author = z.infer<typeof authorsSchema>;
export type Page = z.infer<typeof pagesSchema>;
