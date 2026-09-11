/**
 * Shared Decap meta stamps for Astro content proxy (boot wrap + emit shim).
 * Boot preserves Astro validators; emit may materialize plain Zod equivalents.
 */
import { fieldOptions } from "../meta";

export function relationFieldMeta(collection: string) {
	return fieldOptions({
		widget: "relation",
		relation: { collection },
	});
}

export function imageFieldMeta() {
	return fieldOptions({ widget: "image" });
}

type MetaCapable = {
	meta?: (m: unknown) => unknown;
};

/** Stamp relation meta onto an existing schema (boot wrap of Astro `reference`). */
export function stampRelationSchema<T extends MetaCapable>(
	schema: T,
	collection: string,
): T | unknown {
	if (schema && typeof schema.meta === "function") {
		return schema.meta(relationFieldMeta(collection));
	}
	return schema;
}

/** Stamp image meta onto an existing schema (boot wrap of function-schema `image()`). */
export function stampImageSchema<T extends MetaCapable>(
	schema: T,
): T | unknown {
	if (schema && typeof schema.meta === "function") {
		return schema.meta(imageFieldMeta());
	}
	return schema;
}
