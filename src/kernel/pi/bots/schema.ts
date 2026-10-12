// Minimal JSON Schema (draft 2020-12 subset) validator: type, const, enum, min/max(Length|Items|imum), required,
// properties, additionalProperties:false, items. Enough for personality.schema.json, which drives validation here and
// the option lists of the UI form.
export type Schema = {
	type?: "object" | "array" | "string" | "integer" | "number" | "boolean";
	const?: unknown;
	enum?: unknown[];
	minLength?: number; maxLength?: number; minItems?: number; maxItems?: number; minimum?: number; maximum?: number;
	required?: string[];
	properties?: Record<string, Schema>;
	additionalProperties?: boolean;
	items?: Schema;
};

export function validate(schema: Schema, value: unknown, path = "$"): string[] {
	const errs: string[] = [];
	const bad = (m: string) => errs.push(`${path}: ${m}`);
	if (schema.const !== undefined && value !== schema.const) bad(`must be ${JSON.stringify(schema.const)}`);
	if (schema.enum && !schema.enum.includes(value)) bad(`must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`);
	switch (schema.type) {
		case "string":
			if (typeof value !== "string") { bad("must be a string"); break; }
			if (schema.minLength !== undefined && value.length < schema.minLength) bad(`must have at least ${schema.minLength} character(s)`);
			if (schema.maxLength !== undefined && value.length > schema.maxLength) bad(`must have at most ${schema.maxLength} characters (has ${value.length})`);
			break;
		case "integer": case "number":
			if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) { bad(`must be ${schema.type === "integer" ? "an integer" : "a number"}`); break; }
			if (schema.minimum !== undefined && value < schema.minimum) bad(`must be >= ${schema.minimum}`);
			if (schema.maximum !== undefined && value > schema.maximum) bad(`must be <= ${schema.maximum}`);
			break;
		case "boolean": if (typeof value !== "boolean") bad("must be true or false"); break;
		case "array":
			if (!Array.isArray(value)) { bad("must be a list"); break; }
			if (schema.minItems !== undefined && value.length < schema.minItems) bad(`needs at least ${schema.minItems} item(s)`);
			if (schema.maxItems !== undefined && value.length > schema.maxItems) bad(`allows at most ${schema.maxItems} items (has ${value.length})`);
			if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items!, v, `${path}[${i}]`)));
			break;
		case "object": {
			if (typeof value !== "object" || value === null || Array.isArray(value)) { bad("must be an object"); break; }
			const o = value as Record<string, unknown>;
			for (const r of schema.required ?? []) if (!(r in o)) errs.push(`${path}.${r}: is required`);
			for (const [k, v] of Object.entries(o)) {
				const sub = schema.properties?.[k];
				if (sub) errs.push(...validate(sub, v, `${path}.${k}`));
				else if (schema.additionalProperties === false) errs.push(`${path}.${k}: is not a known field`);
			}
			break;
		}
		default: break;
	}
	return errs;
}
