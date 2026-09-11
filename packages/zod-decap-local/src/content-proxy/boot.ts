/**
 * Boot adapter: Vite alias for stamped loaders + live `astro:content` proxy.
 * Preserves Astro validators; stamps relation / image meta for Decap emit.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { shimPaths } from "./emit";

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

/**
 * Resolve stamp-helpers for the virtual proxy module.
 * When bundled into `dist/astro.js`, helpers live at `dist/content-proxy/stamp-helpers.js`.
 */
function resolveStampHelpersHref(): string {
	const base = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		join(base, "content-proxy", "stamp-helpers.js"),
		join(base, "content-proxy", "stamp-helpers.ts"),
		join(base, "stamp-helpers.js"),
		join(base, "stamp-helpers.ts"),
	];
	const file = candidates.find((p) => existsSync(p));
	if (!file) {
		throw new Error(
			`zod-decap-local stamp-helpers missing near ${base}. Run \`bun run build\`.`,
		);
	}
	return pathToFileURL(file).href;
}

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
			const helpersHref = JSON.stringify(resolveStampHelpersHref());
			return `
import * as __real from ${real};
import { stampRelationSchema, stampImageSchema } from ${helpersHref};

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
	return stampRelationSchema(__real.reference(collection), collection);
}

export function defineCollection(config) {
	if (config && typeof config.schema === "function") {
		const userSchema = config.schema;
		return __real.defineCollection({
			...config,
			schema: (ctx) => {
				const image = () => stampImageSchema(ctx.image());
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

/** Boot-time aliases for `astro/loaders` (stamp glob/file inputs). */
export function viteAliasesForBoot(): {
	find: string | RegExp;
	replacement: string;
}[] {
	const { loaders } = shimPaths();
	return [{ find: /^astro\/loaders$/, replacement: loaders }];
}

/** Boot-time Vite plugins — live `astro:content` proxy for reference/image meta. */
export function vitePluginsForBoot() {
	return [astroContentBootProxy()];
}
