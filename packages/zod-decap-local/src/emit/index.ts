/**
 * Decap emit — package-internal seam for content-config → `config.yml`.
 *
 * Callers (CLI, tests) use `emitFromContentConfig` / `writeDecapConfig` /
 * `buildDecapConfig`. Field walk, collection chrome, and content-config load
 * stay private under this module; they are not part of the package public API.
 *
 * Testable helpers (`fieldFromZod`, `collectionFromSchema`) re-export here so
 * unit tests share the same seam without importing implementation files.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { collectionFromSchema } from "./collection-chrome";
import type { LoadedCollection } from "./load-content-config";

export type { DecapCollection } from "./collection-chrome";
export { collectionFromSchema } from "./collection-chrome";
export type { DecapField } from "./json-schema-to-fields";
export { fieldFromJsonSchema, fieldFromZod } from "./json-schema-to-fields";
export type { LoadedCollection };

export type BuildDecapConfigOptions = {
	collections: LoadedCollection[];
	mediaFolder?: string;
	publicFolder?: string;
	schemaOwnerHint?: string;
};

export type WriteDecapConfigOptions = BuildDecapConfigOptions & {
	root: string;
	outFile?: string;
	check?: boolean;
};

export function buildDecapConfig(options: BuildDecapConfigOptions): string {
	const {
		collections,
		mediaFolder = "public/images",
		publicFolder = "/images",
		schemaOwnerHint = "src/content.config.ts",
	} = options;

	const doc = {
		local_backend: true,
		backend: {
			name: "git-gateway",
		},
		media_folder: mediaFolder,
		public_folder: publicFolder,
		collections: collections.map((c) =>
			collectionFromSchema(c.name, c.schema, c.loader),
		),
	};

	const banner = [
		"# GENERATED FILE — do not hand-edit.",
		`# Schema owner: ${schemaOwnerHint}.`,
		"# Regenerate: astro dev/build (zodDecap integration) or zod-decap-local CLI",
		"# Dev: local_backend + decap-server (started by the Astro integration)",
		"",
	].join("\n");

	return banner + stringify(doc, { lineWidth: 100 });
}

export function writeDecapConfig(options: WriteDecapConfigOptions): {
	yaml: string;
	wrote: boolean;
} {
	const outFile = options.outFile ?? "public/admin/config.yml";
	const outPath = join(options.root, outFile);
	const yaml = buildDecapConfig(options);
	mkdirSync(dirname(outPath), { recursive: true });

	let existing = "";
	try {
		existing = readFileSync(outPath, "utf8");
	} catch {
		existing = "";
	}

	if (options.check) {
		if (existing !== yaml) {
			throw new Error(
				`${outFile} is out of date. Run astro build or regenerate.`,
			);
		}
		return { yaml, wrote: false };
	}

	if (existing === yaml) {
		return { yaml, wrote: false };
	}

	writeFileSync(outPath, yaml, "utf8");
	return { yaml, wrote: true };
}

export async function emitFromContentConfig(options: {
	root: string;
	contentConfig?: string;
	outFile?: string;
	mediaFolder?: string;
	publicFolder?: string;
	check?: boolean;
}): Promise<{ yaml: string; wrote: boolean; contentConfigPath: string }> {
	const { loadContentCollections } = await import("./load-content-config");
	const { collections, contentConfigPath } = await loadContentCollections({
		root: options.root,
		contentConfig: options.contentConfig,
	});
	const relativeHint = contentConfigPath.startsWith(options.root)
		? contentConfigPath.slice(options.root.length).replace(/^\//, "")
		: contentConfigPath;
	const result = writeDecapConfig({
		root: options.root,
		collections,
		outFile: options.outFile,
		mediaFolder: options.mediaFolder,
		publicFolder: options.publicFolder,
		check: options.check,
		schemaOwnerHint: relativeHint,
	});
	return { ...result, contentConfigPath };
}
