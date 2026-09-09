export const FILE_EVENTS = {
  markError: "files:markError",
} as const;

const UUID_REGEX =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

export function tryParseJson<T = unknown>(input: unknown): T | undefined {
  if (typeof input !== "string") return input as T | undefined;
  try {
    return JSON.parse(input) as T;
  } catch {
    return undefined;
  }
}

export async function normalizeAxiosErrorData(data: unknown): Promise<unknown> {
  if (!data) return undefined;
  const blobLike = data as { text?: () => Promise<string> };
  if (typeof blobLike.text === "function") {
    const text = await blobLike.text();
    return tryParseJson(text) ?? text;
  }
  return data;
}

export function extractErrorFileIds(payload: unknown): string[] | undefined {
  if (!payload) return undefined;
  const errorFileIds = (payload as { errorFileIds?: unknown }).errorFileIds;
  if (Array.isArray(errorFileIds)) return errorFileIds as string[];
  if (typeof payload === "string") {
    const matches = payload.match(UUID_REGEX);
    if (matches && matches.length > 0) return Array.from(new Set(matches));
  }
  return undefined;
}

export function broadcastErroredFiles(fileIds: string[]) {
  if (!fileIds || fileIds.length === 0) return;
  window.dispatchEvent(
    new CustomEvent(FILE_EVENTS.markError, { detail: { fileIds } }),
  );
}

export function isZeroByte(
  file: File | { size?: number } | null | undefined,
): boolean {
  if (!file) return true;
  const size = file.size;
  return typeof size === "number" ? size <= 0 : true;
}

export function isEmptyOutput(files: File[] | null | undefined): boolean {
  if (!files || files.length === 0) return true;
  return files.every((f) => f?.size === 0);
}
