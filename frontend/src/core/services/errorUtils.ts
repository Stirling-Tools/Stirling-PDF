export const FILE_EVENTS = {
  markError: 'files:markError',
} as const;

const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

export function tryParseJson<T = unknown>(input: unknown): T | undefined {
  if (typeof input !== 'string') return input as T | undefined;
  try { return JSON.parse(input) as T; } catch { return undefined; }
}

type TextProducer = { text: () => Promise<string> };

function hasTextMethod(value: unknown): value is TextProducer {
  return typeof value === 'object' && value !== null && 'text' in value && typeof (value as { text?: unknown }).text === 'function';
}

export async function normalizeAxiosErrorData(data: unknown): Promise<unknown> {
  if (!data) return undefined;
  if (hasTextMethod(data)) {
    const text = await data.text();
    return tryParseJson(text) ?? text;
  }
  return data;
}

function hasErrorFileIds(payload: unknown): payload is { errorFileIds?: unknown } {
  return typeof payload === 'object' && payload !== null && 'errorFileIds' in payload;
}

export function extractErrorFileIds(payload: unknown): string[] | undefined {
  if (!payload) return undefined;
  if (hasErrorFileIds(payload) && Array.isArray(payload.errorFileIds)) {
    return payload.errorFileIds.filter((value): value is string => typeof value === 'string');
  }
  if (typeof payload === 'string') {
    const matches = payload.match(UUID_REGEX);
    if (matches && matches.length > 0) return Array.from(new Set(matches));
  }
  return undefined;
}

export function broadcastErroredFiles(fileIds: string[]) {
  if (!fileIds || fileIds.length === 0) return;
  window.dispatchEvent(new CustomEvent(FILE_EVENTS.markError, { detail: { fileIds } }));
}

type Sized = { size?: number };

function getFileSize(file: Sized | File | null | undefined): number | undefined {
  if (!file) return undefined;
  if (file instanceof File) return file.size;
  const { size } = file;
  return typeof size === 'number' ? size : undefined;
}

export function isZeroByte(file: File | { size?: number } | null | undefined): boolean {
  const size = getFileSize(file);
  return typeof size === 'number' ? size <= 0 : true;
}

export function isEmptyOutput(files: File[] | null | undefined): boolean {
  if (!files || files.length === 0) return true;
  return files.every(file => getFileSize(file) === 0);
}

