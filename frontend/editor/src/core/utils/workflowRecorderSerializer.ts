export const REENTER_REQUIRED_VALUE = "__REENTER_REQUIRED__";

export interface SerializedWorkflowParameters {
  parameters: Record<string, unknown>;
  hasSensitiveFields: boolean;
  hasNonSerializableFields: boolean;
}

const sensitiveKeyPattern =
  /(password|passphrase|secret|token|apikey|api_key|certificatepassword|privatekey)/i;

export function isSensitiveParameterKey(key: string): boolean {
  return sensitiveKeyPattern.test(key.replace(/[^a-zA-Z0-9_]/g, ""));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBrowserBinary(value: unknown): boolean {
  return (
    (typeof File !== "undefined" && value instanceof File) ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  );
}

interface SerializedValue {
  value?: unknown;
  hasSensitiveFields: boolean;
  hasNonSerializableFields: boolean;
}

function serializeValue(
  value: unknown,
  key: string,
  seen: WeakSet<object>,
): SerializedValue {
  if (isSensitiveParameterKey(key)) {
    return {
      value: REENTER_REQUIRED_VALUE,
      hasSensitiveFields: true,
      hasNonSerializableFields: false,
    };
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return {
      value,
      hasSensitiveFields: false,
      hasNonSerializableFields: false,
    };
  }

  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint" ||
    isBrowserBinary(value) ||
    value instanceof Date
  ) {
    return {
      hasSensitiveFields: false,
      hasNonSerializableFields: true,
    };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return {
        hasSensitiveFields: false,
        hasNonSerializableFields: true,
      };
    }

    seen.add(value);
    let hasSensitiveFields = false;
    let hasNonSerializableFields = false;
    const serializedItems: unknown[] = [];

    value.forEach((item, index) => {
      const serialized = serializeValue(item, String(index), seen);
      hasSensitiveFields ||= serialized.hasSensitiveFields;
      hasNonSerializableFields ||= serialized.hasNonSerializableFields;
      if ("value" in serialized) {
        serializedItems.push(serialized.value);
      }
    });

    seen.delete(value);
    return {
      value: serializedItems,
      hasSensitiveFields,
      hasNonSerializableFields,
    };
  }

  if (!isPlainObject(value)) {
    return {
      hasSensitiveFields: false,
      hasNonSerializableFields: true,
    };
  }

  if (seen.has(value)) {
    return {
      hasSensitiveFields: false,
      hasNonSerializableFields: true,
    };
  }

  seen.add(value);
  let hasSensitiveFields = false;
  let hasNonSerializableFields = false;
  const serializedObject: Record<string, unknown> = {};

  for (const [childKey, childValue] of Object.entries(value)) {
    const serialized = serializeValue(childValue, childKey, seen);
    hasSensitiveFields ||= serialized.hasSensitiveFields;
    hasNonSerializableFields ||= serialized.hasNonSerializableFields;
    if ("value" in serialized) {
      serializedObject[childKey] = serialized.value;
    }
  }

  seen.delete(value);
  return {
    value: serializedObject,
    hasSensitiveFields,
    hasNonSerializableFields,
  };
}

export function serializeWorkflowParameters(
  parameters: unknown,
): SerializedWorkflowParameters {
  if (!isPlainObject(parameters)) {
    return {
      parameters: {},
      hasSensitiveFields: false,
      hasNonSerializableFields: parameters != null,
    };
  }

  const serialized = serializeValue(parameters, "", new WeakSet<object>());
  return {
    parameters: (serialized.value as Record<string, unknown>) ?? {},
    hasSensitiveFields: serialized.hasSensitiveFields,
    hasNonSerializableFields: serialized.hasNonSerializableFields,
  };
}
