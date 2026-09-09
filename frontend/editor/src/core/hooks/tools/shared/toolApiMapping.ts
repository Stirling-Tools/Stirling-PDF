import {
  TOOL_ENDPOINTS,
  type ToolApiParams,
  type ToolApiRequest,
  type ToolEndpoint,
} from "@app/types/toolApiTypes";

export type { ToolApiParams, ToolApiRequest, ToolEndpoint };

const TOOL_ENDPOINT_SET: ReadonlySet<string> = new Set(TOOL_ENDPOINTS);

/**
 * Runtime check that a string is one of the generated tool endpoints, so callers can narrow an
 * arbitrary endpoint path to {@link ToolEndpoint} against the real supported set rather than casting.
 */
export function isToolEndpoint(value: string): value is ToolEndpoint {
  return TOOL_ENDPOINT_SET.has(value);
}

/**
 * Mapping for tools that take only a file and have no request parameters (their
 * generated model is `Record<string, never>`). Both directions are empty; the
 * tool's buildFormData just appends the file.
 */
export function fileOnlyMapping(): {
  toApiParams: () => Record<string, never>;
  fromApiParams: () => Record<string, never>;
} {
  return { toApiParams: () => ({}), fromApiParams: () => ({}) };
}

/** Named file fields to append alongside the serialized parameters. */
export interface FormDataFiles {
  /** Primary document input(s); appended under the `fileInput` field. */
  fileInput?: File | File[];
  /** Any other named file field the endpoint accepts. */
  [field: string]: File | File[] | undefined;
}

function appendPrimitive(
  formData: FormData,
  key: string,
  value: unknown,
): void {
  if (value === undefined || value === null) return;
  if (typeof value === "string") {
    formData.append(key, value);
  } else if (typeof value === "number" || typeof value === "boolean") {
    formData.append(key, `${value}`);
  } else {
    // A non-primitive here means a mapper produced a value the backend cannot
    // receive as a form field. Fail loudly rather than silently drop it:
    // structured fields must be JSON-encoded in the mapper, and Files passed via
    // the `files` argument.
    throw new Error(
      `objectToFormData: field "${key}" has an unsupported value of type ` +
        `"${typeof value}"; expected a string, number, or boolean.`,
    );
  }
}

/**
 * Serialize a backend request model (the output of a `toApiParams` function)
 * into multipart FormData: primitives become string fields, arrays become
 * repeated fields, and `undefined`/`null` are omitted. Files are appended
 * separately via `files`, keeping file plumbing out of the parameter mapper.
 *
 * Throws if a field holds a non-primitive value, since that cannot be sent as a
 * form field: structured fields must be JSON-encoded by the mapper.
 */
export function objectToFormData(
  params: ToolApiRequest,
  files?: FormDataFiles,
): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        appendPrimitive(formData, key, item);
      }
    } else {
      appendPrimitive(formData, key, value);
    }
  }

  if (files) {
    for (const [field, value] of Object.entries(files)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((file) => formData.append(field, file));
      } else {
        formData.append(field, value);
      }
    }
  }

  return formData;
}
