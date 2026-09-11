/**
 * Editorial meta for Decap emit — applied via Zod `.meta(fieldOptions(…))`
 * / `.meta(collectionOptions(…))`.
 *
 * Prefer inference from Zod kinds. Explicit `widget` is for overrides inference
 * cannot know (image / markdown). A `relation` object implies the relation
 * widget — you do not need `widget: "relation"` beside it.
 */
export type RelationOptions = {
	collection: string;
	valueField?: string;
	searchFields?: string[];
	displayFields?: string[];
};

export type DecapWidget =
	| "string"
	| "markdown"
	| "image"
	| "datetime"
	| "number"
	| "boolean"
	| "select"
	| "object"
	| "list"
	| "relation";

type FieldOptionsBase = {
	label?: string;
	/** Escape hatch: merged onto the Decap field as wire keys. */
	decap?: Record<string, unknown>;
};

/**
 * Non-relation field options. `widget` overrides Zod inference when needed
 * (typically `image` or `markdown` on a string).
 */
type FieldOptionsPlain = FieldOptionsBase & {
	widget?: Exclude<DecapWidget, "relation">;
	relation?: never;
};

/**
 * Relation field options. Presence of `relation` implies widget `"relation"`;
 * repeating `widget: "relation"` is optional.
 */
type FieldOptionsRelation = FieldOptionsBase & {
	widget?: "relation";
	relation: RelationOptions;
};

export type FieldOptions = FieldOptionsPlain | FieldOptionsRelation;

export type CollectionOptions = {
	label?: string;
	folder?: string;
	extension?: string;
	format?: "frontmatter" | "yaml" | "json";
	create?: boolean;
	/** Force Decap `body` markdown widget when true; skip when false. */
	body?: boolean;
};

export type DecapMeta = {
	zodDecapField?: FieldOptions;
	zodDecapCollection?: CollectionOptions;
};

export function fieldOptions(opts: FieldOptions): DecapMeta {
	return { zodDecapField: opts };
}

export function collectionOptions(opts: CollectionOptions): DecapMeta {
	return { zodDecapCollection: opts };
}
