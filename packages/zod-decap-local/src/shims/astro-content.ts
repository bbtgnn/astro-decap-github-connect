/**
 * Emit-graph shim for `astro:content` (esbuild rewrite during Decap emit).
 * `defineCollection` is a passthrough; `reference` is stamped for Decap emit.
 * Function-schema `image()` is materialized in `load-content-config` via
 * `astroImageSchema()` (Astro object shape → Decap image widget).
 * Live `astro:content` at boot is wrapped by `vite-astro-content-proxy.ts`.
 */
import type { BaseSchema, CollectionConfig } from "astro/content/config";
import { z } from "zod";
import { fieldOptions } from "../meta";

export { z };

export function defineCollection<S extends BaseSchema>(
	config: CollectionConfig<S>,
): CollectionConfig<S> {
	return config;
}

/** Astro-native relation → stamped Decap relation (emit graph). */
export function reference(collection: string) {
	return z.string().meta(
		fieldOptions({
			widget: "relation",
			relation: { collection },
		}),
	);
}
