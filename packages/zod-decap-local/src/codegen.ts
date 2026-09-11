/**
 * One-way Zod → Decap `config.yml` codegen.
 * Schema owner remains Zod; YAML is a derived artifact for the Decap UI shell.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import type { z } from "zod";
import {
	arrayElement,
	defaultValue,
	enumValues,
	type FieldMeta,
	type FieldUi,
	getFieldMeta,
	isOptional,
	isZodArray,
	isZodEnum,
	isZodObject,
	objectShape,
	unwrap,
	zodTypeName,
} from "./fields";

export type DecapField = {
	name: string;
	label: string;
	widget: string;
	required?: boolean;
	default?: unknown;
	options?: unknown;
	fields?: DecapField[];
	field?: DecapField;
	[key: string]: unknown;
};

export type CollectionSpec = {
	name: string;
	schema: z.ZodType;
};

export type BuildDecapConfigOptions = {
	collections: CollectionSpec[];
	mediaFolder?: string;
	publicFolder?: string;
	schemaOwnerHint?: string;
	/** Optional override; default emit is `local_backend: true` (Decap default :8081). */
	localBackendUrl?: string;
};

export type WriteDecapConfigOptions = BuildDecapConfigOptions & {
	root: string;
	outFile?: string;
	check?: boolean;
};

function inferWidget(schema: z.ZodType): string {
	switch (zodTypeName(schema)) {
		case "string":
			return "string";
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		case "date":
			return "datetime";
		case "enum":
			return "select";
		case "object":
			return "object";
		case "array":
			return "list";
		default:
			return "string";
	}
}

export function fieldFromZod(name: string, schema: z.ZodType): DecapField {
	const inner = unwrap(schema);
	const meta = getFieldMeta(schema);
	const ui: FieldUi | undefined = meta?.ui;
	const label = ui?.label ?? name;
	const widget = ui?.widget ?? inferWidget(inner);
	const field: DecapField = {
		name,
		label,
		widget,
	};

	if (isOptional(schema)) {
		field.required = false;
	}

	const def = defaultValue(schema);
	if (def !== undefined) {
		field.default = def;
	}

	if (ui?.options) {
		for (const [k, v] of Object.entries(ui.options)) {
			field[k] = v;
		}
	}

	if (widget === "object" && isZodObject(inner)) {
		field.fields = objectFields(inner);
	}

	if (widget === "list" && isZodArray(inner)) {
		const item = unwrap(arrayElement(inner));
		if (isZodObject(item)) {
			field.fields = objectFields(item);
		} else if (!field.field) {
			const itemUi = getFieldMeta(item)?.ui;
			field.field = {
				name: "item",
				label: itemUi?.label ?? "item",
				widget: itemUi?.widget ?? inferWidget(item),
			};
		}
	}

	if (widget === "select" && !field.options && isZodEnum(inner)) {
		field.options = enumValues(inner);
	}

	return field;
}

function objectFields(schema: z.ZodType): DecapField[] {
	return Object.entries(objectShape(schema)).map(([name, child]) =>
		fieldFromZod(name, child as z.ZodType),
	);
}

export function collectionFromSchema(
	name: string,
	schema: z.ZodType,
): Record<string, unknown> {
	const rootSchema = unwrap(schema);
	const meta: FieldMeta | undefined = getFieldMeta(schema);
	const collectionMeta = meta?.collection ?? {};
	if (!isZodObject(rootSchema)) {
		throw new Error(`Collection "${name}" schema must be a Zod object`);
	}

	const extension = collectionMeta.extension ?? "md";
	const format = collectionMeta.format ?? "frontmatter";
	const fields = objectFields(rootSchema);

	// Astro keeps markdown body off the Zod schema; Decap needs the conventional field.
	if (
		format === "frontmatter" &&
		(extension === "md" || extension === "mdx") &&
		!fields.some((f) => f.name === "body")
	) {
		fields.push({ name: "body", label: "Body", widget: "markdown" });
	}

	return {
		name,
		label: collectionMeta.label ?? meta?.ui?.label ?? name,
		folder: collectionMeta.folder ?? `src/content/${name}`,
		create: collectionMeta.create ?? true,
		extension,
		format,
		fields,
	};
}

export function buildDecapConfig(options: BuildDecapConfigOptions): string {
	const {
		collections,
		mediaFolder = "public/images",
		publicFolder = "/images",
		schemaOwnerHint = "app schemas (Zod + FieldUi meta)",
		localBackendUrl,
	} = options;

	const doc = {
		// Local FS write-back via `decap-server` (no GitHub OAuth).
		local_backend: localBackendUrl
			? { url: localBackendUrl }
			: true,
		backend: {
			name: "git-gateway",
		},
		media_folder: mediaFolder,
		public_folder: publicFolder,
		collections: collections.map((c) => collectionFromSchema(c.name, c.schema)),
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

	if (options.check) {
		let existing = "";
		try {
			existing = readFileSync(outPath, "utf8");
		} catch {
			existing = "";
		}
		if (existing !== yaml) {
			throw new Error(
				`${outFile} is out of date. Run astro build or regenerate.`,
			);
		}
		return { yaml, wrote: false };
	}

	writeFileSync(outPath, yaml, "utf8");
	return { yaml, wrote: true };
}
