# Content config is the Decap registry; boot proxies stamp loaders

Decap YAML is derived from Astro’s `export const collections` in `content.config`, not a parallel `collectionSchemas` list. Apps author plain Zod plus optional `fieldOptions` / `collectionOptions` meta—no FieldUi constructor helpers.

Loader `base`/`pattern` are not on Astro’s public loader object, so `zodDecap` installs passthrough Vite aliases for `astro/loaders` and a boot Vite plugin that proxies live `astro:content` (`reference` / function-schema `image` meta) while preserving Astro validators. Emit uses a separate esbuild graph that rewrites both modules to shims. CLI shares the emit shims. We rejected a Decap-only schema registry and closure/AST scraping as the source of truth.
