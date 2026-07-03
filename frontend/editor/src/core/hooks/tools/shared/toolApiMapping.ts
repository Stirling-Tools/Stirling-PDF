import {
  type ToolApiParams,
  type ToolApiRequest,
  type ToolEndpoint,
} from "@app/generated/toolApiTypes";

export type { ToolApiParams, ToolApiRequest, ToolEndpoint };

/**
 * Typed, two-way translation between a tool's frontend parameter shape and its
 * backend request model.
 *
 * - `toApiParams` turns the tool's UI parameters into the backend request model
 *   for its endpoint.
 * - `fromApiParams` turns a backend request model (a stored pipeline step, or an
 *   AI-authored plan) back into the tool's UI parameters so it can be rendered
 *   in the real settings component.
 *
 * `TEndpoint` may be a union when a tool routes to several endpoints,
 * in which case both mappers operate over the union of request models.
 */
export interface ToolApiMapping<TFrontend, TEndpoint extends ToolEndpoint> {
  /** Backend endpoint path, or a router when it depends on the parameters. */
  endpoint: TEndpoint | ((params: TFrontend) => TEndpoint);
  /** Frontend params -> spec-checked backend request model. */
  toApiParams: (params: TFrontend) => ToolApiParams[TEndpoint];
  /** Backend request model -> partial frontend params (to re-render the UI). */
  fromApiParams: (apiParams: ToolApiParams[TEndpoint]) => Partial<TFrontend>;
}

/**
 * Mapping for tools whose frontend parameter shape already matches their
 * backend request model 1:1 (no field renaming needed).
 *
 * Constrained to `ToolApiRequest` so identity is only usable when the frontend
 * shape genuinely is one of the generated backend models; divergent tools
 * (Compress, Merge, Rotate, Split, ...) author both directions explicitly.
 */
export function identityMapping<TParams extends ToolApiRequest>(): {
  toApiParams: (params: TParams) => TParams;
  fromApiParams: (apiParams: TParams) => Partial<TParams>;
} {
  return {
    toApiParams: (params) => params,
    fromApiParams: (apiParams) => apiParams,
  };
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
