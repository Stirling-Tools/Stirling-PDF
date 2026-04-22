import type {
  AxiosHeaderValue,
  AxiosResponseHeaders,
  RawAxiosResponseHeaders,
} from "axios";

type HeaderCollection =
  | AxiosResponseHeaders
  | Partial<RawAxiosResponseHeaders>
  | undefined;

function normalizeHeaderValue(value: AxiosHeaderValue | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    return String(value);
  }
  return "";
}

export function getHeaderString(
  headers: HeaderCollection,
  ...candidates: string[]
): string {
  if (!headers || candidates.length === 0) {
    return "";
  }

  for (const candidate of candidates) {
    const value = normalizeHeaderValue(headers[candidate]);
    if (value) {
      return value;
    }
  }

  const candidateSet = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  for (const [key, value] of Object.entries(headers)) {
    if (!candidateSet.has(key.toLowerCase())) {
      continue;
    }
    const normalized = normalizeHeaderValue(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}
