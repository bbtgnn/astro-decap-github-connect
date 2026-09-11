/**
 * Turn Astro `content.config` `collections` into emit-ready entries.
 *
 * Flow: resolve path → bundle/import with shims → materialize schemas → list.
 */
import type { Loader } from "astro/loaders";
import { z } from "zod";
import { resolveContentConfigPath } from "./content-paths";
import { astroImageSchema } from "./image-bridge";
import { importBundledContentConfig } from "./import-bundled-content-config";

/**
 * Emit-time collection entry. Structurally like Astro content-layer config;
 * function-schema `image()` uses the Astro image object shape (see image-bridge).
 */
export type EmitCollectionConfig = {
	loader?: Loader;
	schema?:
		| z.ZodType
		| ((ctx: { image: () => z.ZodType }) => z.ZodType);
};

export type LoadedCollection = {
	name: string;
	schema: z.ZodType;
	loader?: Loader;
};

/** Resolve function schemas (call with Astro-shaped `image()`) into plain Zod. */
function materializeSchema(
	schema: EmitCollectionConfig["schema"],
	name: string,
): z.ZodType {
	if (!schema) {
		throw new Error(`Collection "${name}" has no schema`);
	}
	if (typeof schema === "function") {
		return schema({
			image: () => astroImageSchema(),
		});
	}
	return schema;
}

export function collectionsFromExport(
	collections: Record<string, EmitCollectionConfig> | undefined,
): LoadedCollection[] {
	if (!collections || typeof collections !== "object") {
		throw new Error("content config must export `collections` object");
	}
	return Object.entries(collections).map(([name, config]) => ({
		name,
		schema: materializeSchema(config.schema, name),
		loader: config.loader,
	}));
}

export async function loadContentCollections(options: {
	root: string;
	contentConfig?: string;
}): Promise<{ collections: LoadedCollection[]; contentConfigPath: string }> {
	const contentConfigPath = resolveContentConfigPath(
		options.root,
		options.contentConfig,
	);
	const mod = await importBundledContentConfig<{
		collections?: Record<string, EmitCollectionConfig>;
	}>({
		root: options.root,
		contentConfigPath,
	});
	return {
		collections: collectionsFromExport(mod.collections),
		contentConfigPath,
	};
}
