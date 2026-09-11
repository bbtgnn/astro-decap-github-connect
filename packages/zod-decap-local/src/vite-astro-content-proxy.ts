/**
 * Boot-time Vite proxy for Astro’s virtual `astro:content`.
 * Re-exports the real module; wraps `reference` / function-schema `image()`
 * with Decap field meta without replacing Astro validators.
 */
import { fileURLToPath, pathToFileURL } from "node:url";

const PROXY_ID = "\0zod-decap-local/astro-content-proxy";
const SKIP = "zod-decap-astro-content-proxy";

type ResolveIdOpts = {
	custom?: Record<string, unknown>;
};

type PluginContext = {
	resolve: (
		source: string,
		importer: string | undefined,
		opts?: { skipSelf?: boolean; custom?: Record<string, unknown> },
	) => Promise<{ id: string } | null>;
};

export function astroContentBootProxy() {
	let realId: string | undefined;

	return {
		name: "zod-decap-local:astro-content-proxy",
		enforce: "pre" as const,
		async resolveId(
			this: PluginContext,
			id: string,
			importer: string | undefined,
			options: ResolveIdOpts,
		) {
			if (id === PROXY_ID) return PROXY_ID;
			if (id !== "astro:content") return;
			if (options.custom?.[SKIP]) return;

			const resolved = await this.resolve(id, importer, {
				skipSelf: true,
				custom: { [SKIP]: true },
			});
			if (!resolved) return;
			realId = resolved.id;
			return PROXY_ID;
		},
		load(id: string) {
			if (id !== PROXY_ID || !realId) return;
			const real = JSON.stringify(realId);
			const metaHref = JSON.stringify(
				pathToFileURL(
					fileURLToPath(new URL("./meta.ts", import.meta.url)),
				).href,
			);
			return `
import * as __real from ${real};
import { fieldOptions } from ${metaHref};

export const z = __real.z;
export const render = __real.render;
export const getCollection = __real.getCollection;
export const getEntry = __real.getEntry;
export const getEntries = __real.getEntries;
export const getEntryBySlug = __real.getEntryBySlug;
export const getDataEntryById = __real.getDataEntryById;
export const getLiveCollection = __real.getLiveCollection;
export const getLiveEntry = __real.getLiveEntry;
export const defineLiveCollection = __real.defineLiveCollection;

export function reference(collection) {
	const schema = __real.reference(collection);
	if (schema && typeof schema.meta === "function") {
		return schema.meta(
			fieldOptions({
				widget: "relation",
				relation: { collection },
			}),
		);
	}
	return schema;
}

export function defineCollection(config) {
	if (config && typeof config.schema === "function") {
		const userSchema = config.schema;
		return __real.defineCollection({
			...config,
			schema: (ctx) => {
				const image = () => {
					const schema = ctx.image();
					if (schema && typeof schema.meta === "function") {
						return schema.meta(fieldOptions({ widget: "image" }));
					}
					return schema;
				};
				return userSchema({ ...ctx, image });
			},
		});
	}
	return __real.defineCollection(config);
}
`;
		},
	};
}
