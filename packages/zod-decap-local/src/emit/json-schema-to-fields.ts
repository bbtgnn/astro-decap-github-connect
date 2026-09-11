/**
 * Private to Decap emit: Zod `toJSONSchema` (+ Decap meta) → field configs.
 */
import { z } from "zod";
import type {
	CollectionOptions,
	DecapMeta,
	DecapWidget,
	FieldOptions,
	RelationOptions,
} from "../meta";

/** JSON Schema from Zod, plus Decap meta keys merged by `toJSONSchema`. */
export type EmitJsonSchema = z.core.JSONSchema.JSONSchema & DecapMeta;

export type DecapField = {
	name: string;
	label: string;
	widget: DecapWidget | string;
	required?: boolean;
	default?: unknown;
	options?: unknown;
	fields?: DecapField[];
	field?: DecapField;
	[key: string]: unknown;
};

function zodPublicType(schema: unknown): string | undefined {
	// Zod 4 exposes `.type` on schema instances (e.g. "date", "object").
	if (schema && typeof schema === "object" && "type" in schema) {
		const t = (schema as { type?: unknown }).type;
		return typeof t === "string" ? t : undefined;
	}
	return undefined;
}

export function toEmitJsonSchema(schema: z.ZodType): EmitJsonSchema {
	return z.toJSONSchema(schema, {
		unrepresentable: "any",
		override: (ctx) => {
			// Dates are unrepresentable; map to JSON Schema date-time for widget inference.
			if (zodPublicType(ctx.zodSchema) === "date") {
				ctx.jsonSchema.type = "string";
				ctx.jsonSchema.format = "date-time";
			}
		},
	}) as EmitJsonSchema;
}

function asObjectSchema(node: EmitJsonSchema): EmitJsonSchema | undefined {
	if (typeof node === "boolean") return undefined;
	return node;
}

export function assertNoRefs(node: EmitJsonSchema, path: string): void {
	if (node.$ref) {
		throw new Error(
			`Unsupported JSON Schema $ref at ${path} (Decap emit does not resolve refs)`,
		);
	}
	if (node.$defs) {
		throw new Error(
			`Unsupported JSON Schema $defs at ${path} (Decap emit does not resolve defs)`,
		);
	}
}

export function jsonKind(node: EmitJsonSchema): string {
	if (node.enum) return "enum";
	if (node.format === "date-time" || node.format === "date") return "date";
	const raw = node.type;
	if (Array.isArray(raw)) {
		return raw.find((t) => t !== "null") ?? "unknown";
	}
	return raw ?? "unknown";
}

function fieldOptionsOf(node: EmitJsonSchema): FieldOptions | undefined {
	return node.zodDecapField;
}

export function collectionOptionsOf(
	node: EmitJsonSchema,
): CollectionOptions | undefined {
	return node.zodDecapCollection;
}

/** Astro `ImageFunction` object: { src, width, height, format }. */
export function isAstroImageObject(node: EmitJsonSchema): boolean {
	if (jsonKind(node) !== "object" || !node.properties) return false;
	const keys = Object.keys(node.properties);
	return (
		keys.length === 4 &&
		keys.includes("src") &&
		keys.includes("width") &&
		keys.includes("height") &&
		keys.includes("format")
	);
}

function inferWidget(node: EmitJsonSchema): DecapWidget {
	if (isAstroImageObject(node)) return "image";
	switch (jsonKind(node)) {
		case "string":
			return "string";
		case "number":
		case "integer":
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

const STRINGISH = new Set<string>([
	"string",
	"markdown",
	"image",
	"relation",
	"datetime",
]);

function assertWidgetCompatible(
	name: string,
	widget: string,
	node: EmitJsonSchema,
): void {
	const kind = jsonKind(node);
	const ok =
		(widget === "image" &&
			(kind === "string" || kind === "object" || kind === "unknown")) ||
		(STRINGISH.has(widget) &&
			widget !== "image" &&
			(kind === "string" || kind === "date" || kind === "unknown")) ||
		(widget === "number" && (kind === "number" || kind === "integer")) ||
		(widget === "boolean" && kind === "boolean") ||
		(widget === "select" && kind === "enum") ||
		(widget === "object" && kind === "object") ||
		(widget === "list" && kind === "array") ||
		(widget === "datetime" && (kind === "date" || kind === "string"));
	if (!ok) {
		throw new Error(
			`Field "${name}": widget "${widget}" is incompatible with JSON Schema type "${kind}"`,
		);
	}
}

function itemsNode(node: EmitJsonSchema): EmitJsonSchema {
	const items = node.items;
	if (!items || typeof items === "boolean" || Array.isArray(items)) {
		throw new Error("Expected array schema with a single items type");
	}
	return items as EmitJsonSchema;
}

function hasRelationConfig(
	opts: FieldOptions | undefined,
): opts is FieldOptions & { relation: RelationOptions } {
	return Boolean(opts && "relation" in opts && opts.relation);
}

/** Resolve Decap widget: relation config wins; bare `widget: "relation"` fails. */
export function resolveWidget(
	name: string,
	node: EmitJsonSchema,
	opts: FieldOptions | undefined,
): string {
	if (hasRelationConfig(opts)) {
		if (opts.widget !== undefined && opts.widget !== "relation") {
			throw new Error(
				`Field "${name}": relation config is incompatible with widget "${opts.widget}"`,
			);
		}
		return "relation";
	}
	// Runtime meta may still carry a bare relation widget (invalid FieldOptions).
	const rawWidget = (opts as { widget?: string } | undefined)?.widget;
	if (rawWidget === "relation") {
		throw new Error(
			`Field "${name}": widget "relation" requires relation: { collection, ... }`,
		);
	}
	return rawWidget ?? inferWidget(node);
}

export function fieldFromJsonSchema(
	name: string,
	node: EmitJsonSchema,
	required: boolean,
): DecapField {
	assertNoRefs(node, name);
	const opts = fieldOptionsOf(node);
	const label = opts?.label ?? name;
	const widget = resolveWidget(name, node, opts);
	assertWidgetCompatible(name, widget, node);

	const field: DecapField = {
		name,
		label,
		widget,
	};

	if (!required) {
		field.required = false;
	}

	if (node.default !== undefined) {
		field.default = node.default;
	}

	if (hasRelationConfig(opts)) {
		field.collection = opts.relation.collection;
		field.value_field = opts.relation.valueField ?? "{{slug}}";
		field.search_fields = opts.relation.searchFields ?? ["title", "name"];
		field.display_fields = opts.relation.displayFields ?? ["title", "name"];
	}

	if (opts?.decap) {
		for (const [k, v] of Object.entries(opts.decap)) {
			field[k] = v;
		}
	}

	// Astro image objects emit as a single Decap image widget (path string in CMS).
	if (widget === "object" && jsonKind(node) === "object") {
		field.fields = objectFieldsFromJson(node);
	}

	if (widget === "list" && jsonKind(node) === "array") {
		const item = itemsNode(node);
		assertNoRefs(item, `${name}[]`);
		if (jsonKind(item) === "object") {
			field.fields = objectFieldsFromJson(item);
		} else if (!field.field) {
			const itemOpts = fieldOptionsOf(item);
			field.field = {
				name: "item",
				label: itemOpts?.label ?? "item",
				widget: itemOpts?.widget ?? inferWidget(item),
			};
		}
	}

	if (widget === "select" && !field.options && node.enum) {
		field.options = node.enum;
	}

	return field;
}

export function objectFieldsFromJson(node: EmitJsonSchema): DecapField[] {
	const props = node.properties ?? {};
	const required = new Set(node.required ?? []);
	return Object.entries(props).flatMap(([name, child]) => {
		const schema = asObjectSchema(child as EmitJsonSchema);
		if (!schema) return [];
		return [fieldFromJsonSchema(name, schema, required.has(name))];
	});
}

/** Test/helper seam: Zod field → Decap via JSON Schema. */
export function fieldFromZod(name: string, schema: z.ZodType): DecapField {
	const root = toEmitJsonSchema(z.object({ [name]: schema }));
	const node = root.properties?.[name];
	const schemaNode = node ? asObjectSchema(node as EmitJsonSchema) : undefined;
	if (!schemaNode) {
		throw new Error(`Expected property "${name}" in JSON Schema`);
	}
	const required = root.required?.includes(name) ?? false;
	return fieldFromJsonSchema(name, schemaNode, required);
}
