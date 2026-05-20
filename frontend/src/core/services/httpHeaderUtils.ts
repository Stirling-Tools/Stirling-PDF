type HeaderPrimitive = string | number | boolean;

function normalizeHeaderValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const stringValues = value.filter(
      (entry): entry is HeaderPrimitive =>
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean",
    );
    return stringValues.length > 0
      ? stringValues.map(String).join(", ")
      : undefined;
  }
  return undefined;
}

export function getHeaderValue(headers: unknown, headerName: string): string {
  const normalizedName = headerName.toLowerCase();

  if (!headers || typeof headers !== "object") {
    return "";
  }

  const maybeHeaders = headers as Record<string, unknown> & {
    get?: (name: string) => unknown;
  };

  const directValue =
    maybeHeaders[headerName] ??
    maybeHeaders[normalizedName] ??
    maybeHeaders[headerName.toUpperCase()];
  const normalizedDirect = normalizeHeaderValue(directValue);
  if (normalizedDirect) {
    return normalizedDirect;
  }

  if (typeof maybeHeaders.get === "function") {
    const fromGetter = normalizeHeaderValue(maybeHeaders.get(headerName));
    if (fromGetter) {
      return fromGetter;
    }
  }

  for (const [key, value] of Object.entries(maybeHeaders)) {
    if (key.toLowerCase() === normalizedName) {
      const normalized = normalizeHeaderValue(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  return "";
}
