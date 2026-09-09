import { defineConfig } from "astro/config";
import { zodDecap } from "zod-decap-local/astro";
import { collectionSchemas } from "./src/lib/schemas.ts";

export default defineConfig({
	site: process.env.PUBLIC_SITE_URL,
	integrations: [
		zodDecap({
			collections: collectionSchemas,
			schemaOwnerHint: "src/lib/schemas.ts",
		}),
	],
});
