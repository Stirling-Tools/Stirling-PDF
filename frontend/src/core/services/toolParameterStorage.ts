const STORAGE_KEY = 'stirlingpdf_tool_parameters';

type SerializableValue = string | number | boolean | null | SerializableValue[] | { [key: string]: SerializableValue };

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File;
const isBlob = (value: unknown): value is Blob => typeof Blob !== 'undefined' && value instanceof Blob;

function sanitizeValue(value: unknown): SerializableValue | undefined {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;

  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    if (valueType === 'number' && Number.isNaN(value)) {
      return null;
    }
    return value as SerializableValue;
  }

  if (valueType === 'undefined' || valueType === 'function' || valueType === 'symbol' || valueType === 'bigint') {
    return undefined;
  }

  if (Array.isArray(value)) {
    const sanitizedArray = value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined) as SerializableValue[];
    return sanitizedArray;
  }

  if (isFile(value) || isBlob(value)) {
    return undefined;
  }

  if (valueType === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    const sanitizedEntries: Record<string, SerializableValue> = {};

    for (const [key, entryValue] of entries) {
      const sanitized = sanitizeValue(entryValue);
      if (sanitized !== undefined) {
        sanitizedEntries[key] = sanitized;
      }
    }

    return sanitizedEntries;
  }

  return undefined;
}

function readStorage(): Record<string, SerializableValue> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, SerializableValue>;
    }
  } catch (error) {
    console.error('[toolParameterStorage] Failed to read stored parameters', error);
  }
  return {};
}

function writeStorage(map: Record<string, SerializableValue>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('[toolParameterStorage] Failed to write stored parameters', error);
  }
}

export function loadToolParameters<T>(toolKey: string): Partial<T> | null {
  const storage = readStorage();
  const stored = storage[toolKey];

  if (!stored || typeof stored !== 'object') {
    return null;
  }

  return stored as Partial<T>;
}

export function saveToolParameters<T>(toolKey: string, parameters: T): void {
  const sanitized = sanitizeValue(parameters);
  if (sanitized === undefined) {
    return;
  }

  const storage = readStorage();
  storage[toolKey] = sanitized;
  writeStorage(storage);
}

export function clearToolParameters(toolKey: string): void {
  const storage = readStorage();
  if (Object.prototype.hasOwnProperty.call(storage, toolKey)) {
    delete storage[toolKey];
    writeStorage(storage);
  }
}

export function clearAllToolParameters(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[toolParameterStorage] Failed to clear stored parameters', error);
  }
}
