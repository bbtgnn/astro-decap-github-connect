/**
 * Editorial meta for Decap emit — applied via Zod `.meta(fieldOptions(…))`
 * / `.meta(collectionOptions(…))`.
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

export type FieldOptions =
	| (FieldOptionsBase & {
			widget?: Exclude<DecapWidget, "relation">;
	  })
	| (FieldOptionsBase & {
			widget: "relation";
			relation: RelationOptions;
	  });

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
