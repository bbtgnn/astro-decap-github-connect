/**
 * Stopgap path ↔ Astro `image()` object bridge.
 * Decap edits public path strings; Astro Content Layer `image()` is an object schema.
 */
import { z } from "zod";
import { fieldOptions } from "./meta";

export const ASTRO_IMAGE_FORMATS = [
	"png",
	"jpg",
	"jpeg",
	"tiff",
	"webp",
	"gif",
	"svg",
	"avif",
] as const;

export type AstroImageFormat = (typeof ASTRO_IMAGE_FORMATS)[number];

/** Shape returned by Astro `SchemaContext.image()` / `ImageFunction`. */
export type AstroImageData = {
	src: string;
	width: number;
	height: number;
	format: AstroImageFormat;
};

const formatSchema = z.enum(ASTRO_IMAGE_FORMATS);

/**
 * Zod object matching Astro’s `ImageFunction` return type, stamped for Decap
 * `image` widget emit (CMS still stores a public path string).
 */
export function astroImageSchema() {
	return z
		.object({
			src: z.string(),
			width: z.number(),
			height: z.number(),
			format: formatSchema,
		})
		.meta(fieldOptions({ widget: "image" }));
}

function normalizePublicPath(value: string): string {
	const prefix = "__ASTRO_IMAGE_";
	if (value.startsWith(prefix)) return value;
	return value.startsWith("/") ? value : `/${value.replace(/^\.\//, "")}`;
}

/** Decap / public path string from a stored path or Astro image object. */
export function imagePathForDecap(value: string | AstroImageData): string {
	if (typeof value === "string") return normalizePublicPath(value);
	return normalizePublicPath(value.src);
}

/**
 * Build a minimal Astro image object from a Decap public path.
 * Width/height/format are placeholders when only the path is known.
 */
export function decapPathToAstroImage(
	path: string,
	opts?: Partial<Pick<AstroImageData, "width" | "height" | "format">>,
): AstroImageData {
	return {
		src: normalizePublicPath(path),
		width: opts?.width ?? 0,
		height: opts?.height ?? 0,
		format: opts?.format ?? "png",
	};
}
