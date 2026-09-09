#!/usr/bin/env bun
/**
 * CLI for CI drift checks. Prefer the Astro integration for normal writes.
 *
 * Usage (from an app that exports collectionSchemas):
 *   bun run ./scripts/codegen-check.ts
 *
 * Or:
 *   zod-decap-local --check --root . --from ./src/lib/schemas.ts
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type CollectionSpec, writeDecapConfig } from "./codegen";

function argValue(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	if (idx === -1) return undefined;
	return process.argv[idx + 1];
}

const check = process.argv.includes("--check");
const root = resolve(argValue("--root") ?? process.cwd());
const from = argValue("--from");

if (!from) {
	console.error(
		"Usage: zod-decap-local [--check] --root <dir> --from <schemas-module>",
	);
	console.error(
		"  schemas-module must export `collectionSchemas: CollectionSpec[]`",
	);
	process.exit(1);
}

const mod = await import(pathToFileURL(resolve(root, from)).href);
const collections = mod.collectionSchemas as CollectionSpec[] | undefined;
if (!Array.isArray(collections)) {
	console.error(`${from} must export collectionSchemas array`);
	process.exit(1);
}

const result = writeDecapConfig({
	root,
	collections,
	check,
	outFile: argValue("--out"),
	mediaFolder: argValue("--media-folder"),
	publicFolder: argValue("--public-folder"),
	schemaOwnerHint: argValue("--schema-owner") ?? from.replace(/^\.\//, ""),
});

if (result.wrote) {
	console.log(`Wrote config.yml under ${root}`);
} else {
	console.log("config.yml is up to date");
}
