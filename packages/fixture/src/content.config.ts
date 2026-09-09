import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import type { z as AstroZod } from "astro/zod";
import { authorsSchema, pagesSchema, postsSchema } from "./lib/schemas";

/** Zod package schema → Astro `defineCollection` (typed against astro/zod). */
function asAstroSchema<T>(schema: T): AstroZod.ZodTypeAny {
	return schema as unknown as AstroZod.ZodTypeAny;
}

/**
 * Schema owner = Zod (+ FieldUi meta) in `src/lib/schemas.ts`.
 * `zodDecap` integration regenerates `public/admin/config.yml`. Do not hand-edit YAML.
 */
const authors = defineCollection({
	loader: glob({
		pattern: "**/*.{yml,yaml}",
		base: "./src/content/authors",
	}),
	schema: asAstroSchema(authorsSchema),
});

const posts = defineCollection({
	loader: glob({
		pattern: "**/*.{md,mdx}",
		base: "./src/content/posts",
	}),
	schema: asAstroSchema(postsSchema),
});

const pages = defineCollection({
	loader: glob({
		pattern: "**/*.{md,mdx}",
		base: "./src/content/pages",
	}),
	schema: asAstroSchema(pagesSchema),
});

export const collections = { authors, posts, pages };
