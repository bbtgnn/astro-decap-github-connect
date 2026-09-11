import { defineConfig } from "astro/config";
import { zodDecap } from "zod-decap-local/astro";
import { collectionSchemas } from "./src/lib/schemas.ts";

function withTrailingSlash(path) {
	if (path === "/") return "/";
	return path.endsWith("/") ? path : `${path}/`;
}

const base = withTrailingSlash(process.env.PUBLIC_BASE_PATH || "/");

export default defineConfig({
	site: process.env.PUBLIC_SITE_URL,
	base,
	integrations: [
		zodDecap({
			collections: collectionSchemas,
			schemaOwnerHint: "src/lib/schemas.ts",
		}),
	],
});
