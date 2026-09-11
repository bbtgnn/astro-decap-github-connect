# Content config is the Decap registry; boot proxies stamp loaders

Decap YAML is derived from Astro’s `export const collections` in `content.config`, not a parallel `collectionSchemas` list. Apps author plain Zod plus optional `fieldOptions` / `collectionOptions` meta—no FieldUi constructor helpers.

Loader `base`/`pattern` are not on Astro’s public loader object, so `zodDecap` installs passthrough Vite aliases for `astro/loaders` (and a codegen load graph that shims `astro:content`) to stamp those inputs for emit. CLI uses the same shims. We rejected a Decap-only schema registry and closure/AST scraping as the source of truth.
