/**
 * API service for form-related backend calls.
 */
import apiClient from "@app/services/apiClient";
import {
  readFieldBundle,
  supportsFieldBundle,
} from "@app/tools/formFill/fieldBundle";
import type {
  FormField,
  NewFieldDefinition,
  ModifyFieldDefinition,
  FieldEditBatch,
  FieldEditResult,
  SkippedFieldEdit,
} from "@app/tools/formFill/types";
import type { XfaMode, XfaSyncSummary } from "@app/tools/formFill/xfa";

/**
 * Fetch form fields with coordinates from the backend.
 * Calls POST /api/v1/form/fields-with-coordinates
 */
export async function fetchFormFieldsWithCoordinates(
  file: File | Blob,
): Promise<FormField[]> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<FormField[]>(
    "/api/v1/form/fields-with-coordinates",
    formData,
  );
  return response.data;
}

/**
 * Fill form fields and get back a filled PDF blob.
 * Calls POST /api/v1/form/fill
 */
export async function fillFormFields(
  file: File | Blob,
  values: Record<string, string>,
  flatten: boolean = false,
  xfaMode?: XfaMode,
): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "data",
    new Blob([JSON.stringify(values)], { type: "application/json" }),
  );
  formData.append("flatten", String(flatten));
  if (xfaMode) formData.append("xfaMode", xfaMode);

  const response = await apiClient.post("/api/v1/form/fill", formData, {
    responseType: "blob",
  });
  return response.data;
}

/**
 * POST /api/v1/form/xfa-sync: brings a hybrid form's XFA data in line with its AcroForm fields,
 * or removes the XFA, for a PDF the browser filled itself. The endpoint answers with a JSON report
 * that carries the updated PDF as base64.
 *
 * @param changedFields names of the fields the user edited, which lets the backend overwrite the
 *   stored value of a formatted (numeric, date) field
 */
export async function syncXfaForm(
  file: File | Blob,
  mode: Exclude<XfaMode, "none">,
  changedFields: string[],
): Promise<{ blob: Blob; summary: XfaSyncSummary }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", mode);
  formData.append(
    "changedFields",
    new Blob([JSON.stringify(changedFields)], { type: "application/json" }),
  );

  const response = await apiClient.post<XfaSyncSummary & { pdf: string }>(
    "/api/v1/form/xfa-sync",
    formData,
  );
  const { pdf, ...summary } = response.data;
  const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
  return { blob: new Blob([bytes], { type: "application/pdf" }), summary };
}

/**
 * Extract form fields as CSV.
 * Calls POST /api/v1/form/extract-csv
 */
export async function extractFormFieldsCsv(
  file: File | Blob,
  values?: Record<string, string>,
): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file);
  if (values) {
    formData.append(
      "data",
      new Blob([JSON.stringify(values)], { type: "application/json" }),
    );
  }

  const response = await apiClient.post("/api/v1/form/extract-csv", formData, {
    responseType: "blob",
  });
  return response.data;
}

/**
 * Extract form fields as XLSX.
 * Calls POST /api/v1/form/extract-xlsx
 */
export async function extractFormFieldsXlsx(
  file: File | Blob,
  values?: Record<string, string>,
): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file);
  if (values) {
    formData.append(
      "data",
      new Blob([JSON.stringify(values)], { type: "application/json" }),
    );
  }

  const response = await apiClient.post("/api/v1/form/extract-xlsx", formData, {
    responseType: "blob",
  });
  return response.data;
}

/** POST /api/v1/form/add-fields: create fields, returns the updated PDF blob. */
export async function addFormFields(
  file: File | Blob,
  fields: NewFieldDefinition[],
): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "fields",
    new Blob([JSON.stringify(fields)], { type: "application/json" }),
  );

  const response = await apiClient.post("/api/v1/form/add-fields", formData, {
    responseType: "blob",
  });
  return response.data;
}

/** POST /api/v1/form/modify-fields: rename/retype/move/resize, returns the updated PDF blob. */
export async function modifyFormFields(
  file: File | Blob,
  updates: ModifyFieldDefinition[],
): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "updates",
    new Blob([JSON.stringify(updates)], { type: "application/json" }),
  );

  const response = await apiClient.post(
    "/api/v1/form/modify-fields",
    formData,
    { responseType: "blob" },
  );
  return response.data;
}

/**
 * POST /api/v1/form/edit-fields: add + modify + delete in one request. Asks for the field list in
 * the same response where the browser can unpack it, which saves uploading the result back again.
 */
export async function applyFieldEdits(
  file: File | Blob,
  batch: FieldEditBatch,
  xfaMode?: XfaMode,
): Promise<FieldEditResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "edits",
    new Blob([JSON.stringify(batch)], { type: "application/json" }),
  );
  if (xfaMode) formData.append("xfaMode", xfaMode);

  // Off for now. Skipping the follow-up fetch changes when the viewer settles its page scale:
  // the page renders at ~1.5x and then stops responding to zoom. The reader and the endpoint are
  // both tested and ready; this flips back on once that interaction is understood.
  const BUNDLE_ENABLED = false;
  const includeFields = BUNDLE_ENABLED && supportsFieldBundle();
  const response = await apiClient.post("/api/v1/form/edit-fields", formData, {
    responseType: "blob",
    params: includeFields ? { includeFields: true } : undefined,
  });
  const result: FieldEditResult = {
    blob: response.data,
    skipped: parseSkippedEdits(response.headers?.[SKIPPED_EDITS_HEADER]),
    skippedTotal: Number(response.headers?.[SKIPPED_EDITS_TOTAL_HEADER]) || 0,
  };
  if (!includeFields) return result;

  // Null only when the backend ignored the flag and sent a bare PDF; an unreadable archive throws
  // rather than letting the caller save the archive over the user's document.
  const bundle = await readFieldBundle(response.data);
  return bundle
    ? { ...result, blob: bundle.pdf, fields: bundle.fields }
    : result;
}

/** Set by the backend when it could not apply every requested edit. */
const SKIPPED_EDITS_HEADER = "x-stirling-skipped-field-edits";
const SKIPPED_EDITS_TOTAL_HEADER = "x-stirling-skipped-field-edits-total";

/** Base64 JSON, so a reason containing spaces or non-ASCII survives the header intact. */
function parseSkippedEdits(raw: unknown): SkippedFieldEdit[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(parsed) ? (parsed as SkippedFieldEdit[]) : [];
  } catch {
    return [];
  }
}

/** POST /api/v1/form/delete-fields: delete by name, returns the updated PDF blob. */
export async function deleteFormFields(
  file: File | Blob,
  names: string[],
): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "names",
    new Blob([JSON.stringify(names)], { type: "application/json" }),
  );

  const response = await apiClient.post(
    "/api/v1/form/delete-fields",
    formData,
    { responseType: "blob" },
  );
  return response.data;
}
