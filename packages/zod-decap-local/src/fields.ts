/**
 * Light FieldUi helpers — Zod is source of truth; widget meta rides `.meta()`.
 * Intentionally tiny; not shared with @cms/*.
 */
import { z } from "zod";

export type FieldUi = {
	widget: string;
	label?: string;
	options?: Record<string, unknown>;
};

export type FieldMeta = {
	ui?: FieldUi;
	/** Collection chrome on the root object schema. */
	collection?: {
		label?: string;
		folder?: string;
		extension?: string;
		format?: "frontmatter" | "yaml" | "json";
		create?: boolean;
	};
};

export type FieldUiOptions = {
	label?: string;
	options?: Record<string, unknown>;
};

type ZodLike = z.ZodType & {
	meta?: (metadata?: FieldMeta) => FieldMeta | undefined;
	_zod?: {
		def?: {
			type?: string;
			innerType?: ZodLike;
			schema?: ZodLike;
			defaultValue?: unknown;
			element?: ZodLike;
			shape?: z.ZodRawShape;
			entries?: Record<string, unknown>;
		};
	};
};

function defType(schema: z.ZodType): string {
	return ((schema as ZodLike)._zod?.def?.type ?? "") as string;
}

function innerType(schema: ZodLike): ZodLike | undefined {
	return schema._zod?.def?.innerType;
}

function withUi<T extends z.ZodType>(
	schema: T,
	widget: string,
	opts?: FieldUiOptions,
): T {
	return schema.meta({
		ui: {
			widget,
			label: opts?.label,
			options: opts?.options,
		},
	} satisfies FieldMeta) as T;
}

export function text(opts?: FieldUiOptions) {
	return withUi(z.string(), "string", opts);
}

export function markdown(opts?: FieldUiOptions) {
	return withUi(z.string(), "markdown", opts);
}

export function boolean(opts?: FieldUiOptions & { default?: boolean }) {
	const base = z.boolean();
	const schema =
		opts?.default !== undefined ? base.default(opts.default) : base;
	return withUi(schema, "boolean", opts);
}

export function datetime(opts?: FieldUiOptions) {
	return withUi(z.coerce.date(), "datetime", opts);
}

export function number(opts?: FieldUiOptions) {
	return withUi(z.number(), "number", opts);
}

export function image(opts?: FieldUiOptions) {
	return withUi(z.string(), "image", opts);
}

export function select(
	values: readonly [string, ...string[]],
	opts?: FieldUiOptions,
) {
	return withUi(z.enum(values), "select", {
		...opts,
		options: { ...opts?.options, options: [...values] },
	});
}

/** Decap relation → Zod string (entry id / slug). */
export function relation(
	collection: string,
	opts?: FieldUiOptions & {
		valueField?: string;
		searchFields?: string[];
		displayFields?: string[];
	},
) {
	return withUi(z.string(), "relation", {
		...opts,
		options: {
			collection,
			value_field: opts?.valueField ?? "{{slug}}",
			search_fields: opts?.searchFields ?? ["title", "name"],
			display_fields: opts?.displayFields ?? ["title", "name"],
			...opts?.options,
		},
	});
}

export function object<T extends z.ZodRawShape>(
	shape: T,
	opts?: FieldUiOptions & { collection?: FieldMeta["collection"] },
) {
	const schema = z.object(shape);
	const meta: FieldMeta = {};
	if (opts?.label || opts?.options) {
		meta.ui = {
			widget: "object",
			label: opts.label,
			options: opts.options,
		};
	}
	if (opts?.collection) {
		meta.collection = opts.collection;
	}
	return schema.meta(meta) as z.ZodObject<T>;
}

/** Walk wrappers and return the first non-empty `.meta()`. */
export function getFieldMeta(schema: z.ZodType): FieldMeta | undefined {
	let current: ZodLike | undefined = schema as ZodLike;
	for (let i = 0; i < 12 && current; i++) {
		const meta =
			typeof current.meta === "function"
				? (current.meta() as FieldMeta | undefined)
				: undefined;
		if (meta && Object.keys(meta).length > 0) return meta;

		const type = current._zod?.def?.type;
		if (type === "optional" || type === "nullable" || type === "default") {
			current = current._zod?.def?.innerType;
			continue;
		}
		if (type === "pipe" || type === "transform" || type === "readonly") {
			current = current._zod?.def?.innerType ?? current._zod?.def?.schema;
			continue;
		}
		break;
	}
	return undefined;
}

/** Walk Zod wrappers (optional, default, …) to the inner type. */
export function unwrap(schema: z.ZodType): z.ZodType {
	let current: ZodLike = schema as ZodLike;
	for (let i = 0; i < 12; i++) {
		const type = current._zod?.def?.type;
		if (type === "optional" || type === "nullable" || type === "default") {
			const next = innerType(current);
			if (!next) break;
			current = next;
			continue;
		}
		if (type === "pipe" || type === "transform" || type === "readonly") {
			const next = innerType(current) ?? current._zod?.def?.schema;
			if (!next) break;
			current = next;
			continue;
		}
		return current as z.ZodType;
	}
	return current as z.ZodType;
}

export function isOptional(schema: z.ZodType): boolean {
	let current: ZodLike = schema as ZodLike;
	for (let i = 0; i < 12; i++) {
		const type = current._zod?.def?.type;
		if (type === "optional" || type === "nullable") return true;
		if (type === "default") {
			const next = innerType(current);
			if (!next) return false;
			current = next;
			continue;
		}
		return false;
	}
	return false;
}

export function defaultValue(schema: z.ZodType): unknown {
	let current: ZodLike = schema as ZodLike;
	for (let i = 0; i < 12; i++) {
		const type = current._zod?.def?.type;
		if (type === "default") {
			return current._zod?.def?.defaultValue;
		}
		if (type === "optional" || type === "nullable") {
			const next = innerType(current);
			if (!next) return undefined;
			current = next;
			continue;
		}
		return undefined;
	}
	return undefined;
}

export function zodTypeName(schema: z.ZodType): string {
	return defType(unwrap(schema));
}

export function isZodObject(schema: z.ZodType): schema is z.ZodObject {
	return zodTypeName(schema) === "object";
}

export function isZodArray(schema: z.ZodType): schema is z.ZodArray<z.ZodType> {
	return zodTypeName(schema) === "array";
}

export function isZodEnum(schema: z.ZodType): boolean {
	return zodTypeName(schema) === "enum";
}

export function objectShape(schema: z.ZodType): z.ZodRawShape {
	const inner = unwrap(schema) as ZodLike;
	return (inner._zod?.def?.shape ?? {}) as z.ZodRawShape;
}

export function arrayElement(schema: z.ZodType): z.ZodType {
	const inner = unwrap(schema) as ZodLike;
	const element = inner._zod?.def?.element;
	if (!element) {
		throw new Error("Expected Zod array schema with an element type");
	}
	return element as z.ZodType;
}

export function enumValues(schema: z.ZodType): string[] {
	const inner = unwrap(schema) as z.ZodEnum<Record<string, string>>;
	return [...inner.options];
}
