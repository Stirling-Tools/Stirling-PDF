import apiClient from "@app/services/apiClient";
import {
  FIELD_TYPES,
  type FieldRow,
  type FieldType,
} from "@app/hooks/tools/extractFields/fieldsSchema";

export const SUGGEST_SCHEMA_ENDPOINT = "/api/v1/docparse/suggest-schema";

/** Cap on proposed fields; keeps the builder scannable in the side panel. */
export const SUGGEST_MAX_FIELDS = 8;

/** One field the backend proposes for an extraction schema. */
export interface SuggestedSchemaField {
  name?: string;
  type?: string;
  description?: string;
}

export interface SuggestSchemaResponse {
  mode?: string;
  fields?: SuggestedSchemaField[];
}

const isFieldType = (value: unknown): value is FieldType =>
  typeof value === "string" && FIELD_TYPES.includes(value as FieldType);

/** Map the engine's proposals to builder rows, dropping unusable entries. */
export function suggestedFieldsToRows(
  fields: SuggestedSchemaField[] | undefined,
): FieldRow[] {
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((field) => typeof field?.name === "string" && field.name.trim())
    .map((field) => ({
      name: field.name!.trim(),
      type: isFieldType(field.type) ? field.type : "string",
      description:
        typeof field.description === "string" ? field.description.trim() : "",
    }));
}

/** POST the document; get AI-proposed schema rows for the builder. */
export async function requestSuggestedFields(file: File): Promise<FieldRow[]> {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("maxFields", String(SUGGEST_MAX_FIELDS));
  const response = await apiClient.post<SuggestSchemaResponse>(
    SUGGEST_SCHEMA_ENDPOINT,
    formData,
  );
  return suggestedFieldsToRows(response.data?.fields);
}
