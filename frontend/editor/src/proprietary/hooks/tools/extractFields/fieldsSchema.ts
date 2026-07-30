/**
 * The Extract Fields schema builder model: flat rows of {name, type, description}
 * serialized to the JSON Schema object string the backend's fieldsSchema expects.
 */

export const FIELD_TYPES = ["string", "number", "integer", "boolean"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldRow {
  name: string;
  type: FieldType;
  description: string;
}

export const emptyFieldRow = (): FieldRow => ({
  name: "",
  type: "string",
  description: "",
});

/** Rows with a non-empty name, i.e. the ones worth serializing. */
export function namedRows(rows: FieldRow[]): FieldRow[] {
  return rows.filter((row) => row.name.trim().length > 0);
}

/** Serialize builder rows to the JSON Schema string sent as fieldsSchema. */
export function rowsToSchemaString(rows: FieldRow[]): string {
  const properties: Record<string, { type: FieldType; description?: string }> =
    {};
  for (const row of namedRows(rows)) {
    properties[row.name.trim()] = {
      type: row.type,
      ...(row.description.trim()
        ? { description: row.description.trim() }
        : {}),
    };
  }
  return JSON.stringify({
    type: "object",
    properties,
    required: Object.keys(properties),
  });
}

const isFieldType = (value: unknown): value is FieldType =>
  typeof value === "string" && FIELD_TYPES.includes(value as FieldType);

/** Parse a fieldsSchema string back into builder rows; [] on anything unusable. */
export function rowsFromSchemaString(schema: string): FieldRow[] {
  try {
    const parsed = JSON.parse(schema) as {
      properties?: Record<string, { type?: unknown; description?: unknown }>;
    };
    if (!parsed || typeof parsed !== "object" || !parsed.properties) return [];
    return Object.entries(parsed.properties).map(([name, prop]) => ({
      name,
      type: isFieldType(prop?.type) ? prop.type : "string",
      description:
        typeof prop?.description === "string" ? prop.description : "",
    }));
  } catch {
    return [];
  }
}
