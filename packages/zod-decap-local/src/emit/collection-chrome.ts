/**
 * Private to Decap emit: loader stamp + collection meta → chrome and fields.
 */
import type { Loader } from "astro/loaders";
import type { z } from "zod";
import type { CollectionOptions, DecapMeta } from "../meta";
import { getLoaderStamp, type LoaderStamp } from "../stamps";
import {
	assertNoRefs,
	collectionOptionsOf,
	type DecapField,
	jsonKind,
	objectFieldsFromJson,
	toEmitJsonSchema,
} from "./json-schema-to-fields";

export type DecapCollection = {
	name: string;
	label: string;
	folder: string;
	create: boolean;
	extension: string;
	format: "frontmatter" | "yaml" | "json";
	fields: DecapField[];
};

function extensionFromPattern(pattern: string | string[]): string | undefined {
	const p = Array.isArray(pattern) ? pattern.join(",") : pattern;
	if (/\{\s*yml\s*,\s*yaml\s*\}|yml|yaml/i.test(p) && !/\.md/i.test(p)) {
		return p.includes("yaml") && !p.includes("yml") ? "yaml" : "yml";
	}
	// Prefer md when both md and mdx appear (typical Decap folder collection).
	if (/\.md\b|(?:^|[{,\s])md(?:[},\s]|$)/i.test(p)) return "md";
	if (/\.mdx\b|mdx/i.test(p)) return "mdx";
	if (/\.json\b/i.test(p)) return "json";
	return undefined;
}

function formatForExtension(
	extension: string,
): "frontmatter" | "yaml" | "json" {
	if (extension === "yml" || extension === "yaml") return "yaml";
	if (extension === "json") return "json";
	return "frontmatter";
}

function dirnameOfFile(fileName: string): string {
	const normalized = fileName.replace(/^\.\//, "");
	const idx = normalized.lastIndexOf("/");
	return idx === -1 ? "." : normalized.slice(0, idx);
}

/** Fill folder/extension/format from stamped glob/file (or require collectionOptions). */
export function chromeFromStamp(
	name: string,
	stamp: LoaderStamp | undefined,
	override: CollectionOptions | undefined,
): CollectionOptions & {
	folder: string;
	extension: string;
	format: "frontmatter" | "yaml" | "json";
} {
	let folder = override?.folder;
	let extension = override?.extension;
	let format = override?.format;

	if (stamp?.kind === "glob") {
		folder ??= stamp.base?.replace(/^\.\//, "") ?? `src/content/${name}`;
		extension ??= extensionFromPattern(stamp.pattern) ?? "md";
		format ??= formatForExtension(extension);
	} else if (stamp?.kind === "file") {
		folder ??= dirnameOfFile(stamp.fileName);
		const ext = stamp.fileName.split(".").pop();
		extension ??= ext ?? "json";
		format ??= formatForExtension(extension);
	} else if (!folder || !extension || !format) {
		if (override?.folder && override?.extension && override?.format) {
			folder = override.folder;
			extension = override.extension;
			format = override.format;
		} else {
			throw new Error(
				`Collection "${name}": loader is not a stamped glob/file; provide collectionOptions({ folder, extension, format })`,
			);
		}
	}

	return {
		...override,
		folder: folder!,
		extension: extension!,
		format: format!,
		label: override?.label ?? name,
		create: override?.create ?? true,
		body: override?.body,
	};
}

/** Copy loader stamp folder/extension/format into collection meta before JSON Schema emit. */
export function schemaWithCollectionChrome(
	schema: z.ZodType,
	name: string,
	loader?: Loader,
): z.ZodType {
	const existing = (
		typeof schema.meta === "function" ? schema.meta() : undefined
	) as DecapMeta | undefined;
	const override = existing?.zodDecapCollection;
	const chrome = chromeFromStamp(name, getLoaderStamp(loader), override);
	return schema.meta({
		...existing,
		zodDecapCollection: chrome,
	});
}

export function collectionFromSchema(
	name: string,
	schema: z.ZodType,
	loader?: Loader,
): DecapCollection {
	const enriched = schemaWithCollectionChrome(schema, name, loader);
	const json = toEmitJsonSchema(enriched);
	assertNoRefs(json, name);

	if (jsonKind(json) !== "object" || !json.properties) {
		throw new Error(`Collection "${name}" schema must be a Zod object`);
	}

	const chrome = collectionOptionsOf(json);
	if (!chrome?.folder || !chrome.extension || !chrome.format) {
		throw new Error(
			`Collection "${name}": missing folder/extension/format after stamp merge`,
		);
	}

	const fields = objectFieldsFromJson(json);
	const wantBody =
		chrome.body === true ||
		(chrome.body !== false &&
			chrome.format === "frontmatter" &&
			(chrome.extension === "md" || chrome.extension === "mdx"));

	if (wantBody && !fields.some((f) => f.name === "body")) {
		fields.push({ name: "body", label: "Body", widget: "markdown" });
	}

	return {
		name,
		label: chrome.label ?? name,
		folder: chrome.folder,
		create: chrome.create ?? true,
		extension: chrome.extension,
		format: chrome.format,
		fields,
	};
}
