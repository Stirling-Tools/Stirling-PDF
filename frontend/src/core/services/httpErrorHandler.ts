// frontend/src/services/httpErrorHandler.ts
import axios from 'axios';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import { alert } from '@app/components/toast';
import { broadcastErroredFiles, extractErrorFileIds, normalizeAxiosErrorData } from '@app/services/errorUtils';
import { showSpecialErrorToast } from '@app/services/specialErrorToasts';

const FRIENDLY_FALLBACK = 'There was an error processing your request.';
const MAX_TOAST_BODY_CHARS = 400; // avoid massive, unreadable toasts

function clampText(s: string, max = MAX_TOAST_BODY_CHARS): string {
  return s && s.length > max ? `${s.slice(0, max)}…` : s;
}

function isUnhelpfulMessage(msg: string | null | undefined): boolean {
  const s = (msg || '').trim();
  if (!s) return true;
  // Common unhelpful payloads we see
  if (s === '{}' || s === '[]') return true;
  if (/^request failed/i.test(s)) return true;
  if (/^network error/i.test(s)) return true;
  if (/^[45]\d\d\b/.test(s)) return true; // "500 Server Error" etc.
  return false;
}

function titleForStatus(status?: number): string {
  if (!status) return 'Network error';
  if (status >= 500) return 'Server error';
  if (status >= 400) return 'Request error';
  return 'Request failed';
}

type AxiosErrorData = {
  message?: string;
  errorFileIds?: string[];
  [key: string]: unknown;
};

function isErrorWithMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string';
}

function extractAxiosErrorMessage(error: unknown): { title: string; body: string } {
  if (axios.isAxiosError<AxiosErrorData | string | undefined>(error)) {
    const status = error.response?.status;
    const raw = error.response?.data;
    let parsed: AxiosErrorData | string | undefined;

    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw) as AxiosErrorData;
      } catch {
        parsed = raw;
      }
    } else {
      parsed = raw as AxiosErrorData | undefined;
    }

    const extractIds = (): string[] | undefined => {
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const idsCandidate = (parsed as AxiosErrorData).errorFileIds;
        if (Array.isArray(idsCandidate)) {
          return idsCandidate.filter((id): id is string => typeof id === 'string');
        }
      }
      if (typeof raw === 'string') {
        const uuidMatches = raw.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g);
        return uuidMatches && uuidMatches.length > 0 ? Array.from(new Set(uuidMatches)) : undefined;
      }
      return undefined;
    };

    const body = ((): string => {
      if (!parsed) return typeof raw === 'string' ? raw : '';
      if (typeof parsed === 'string') return parsed;
      const ids = extractIds();
      if (ids && ids.length > 0) return `Failed files: ${ids.join(', ')}`;
      if (parsed.message) return parsed.message;
      try {
        return JSON.stringify(parsed);
      } catch {
        return '';
      }
    })();

    const ids = extractIds();
    const title = titleForStatus(status);
    if (ids && ids.length > 0) {
      return { title, body: 'Process failed due to invalid/corrupted file(s)' };
    }
    if (status === 422) {
      const fallbackMsg = 'Process failed due to invalid/corrupted file(s)';
      const bodyMsg = isUnhelpfulMessage(body) ? fallbackMsg : body;
      return { title, body: bodyMsg };
    }
    const bodyMsg = isUnhelpfulMessage(body) ? FRIENDLY_FALLBACK : body;
    return { title, body: bodyMsg };
  }

  try {
    if (isErrorWithMessage(error)) {
      const msg = error.message;
      return { title: 'Network error', body: isUnhelpfulMessage(msg) ? FRIENDLY_FALLBACK : msg };
    }
    const fallbackMessage = String(error);
    return { title: 'Network error', body: isUnhelpfulMessage(fallbackMessage) ? FRIENDLY_FALLBACK : fallbackMessage };
  } catch (parseError) {
    console.debug('extractAxiosErrorMessage', parseError);
    return { title: 'Network error', body: FRIENDLY_FALLBACK };
  }
}

// Module-scoped state to reduce global variable usage
const recentSpecialByEndpoint: Record<string, number> = {};
const SPECIAL_SUPPRESS_MS = 1500; // brief window to suppress generic duplicate after special toast

/**
 * Handles HTTP errors with toast notifications and file error broadcasting
 * Returns true if the error should be suppressed (deduplicated), false otherwise
 */
type ErrorWithConfig = {
  config?: (AxiosRequestConfig & { suppressErrorToast?: boolean }) | null;
  response?: {
    status?: number;
    data?: unknown;
  };
};

function toAxiosError(error: unknown): AxiosError<unknown> | undefined {
  return axios.isAxiosError(error) ? error : undefined;
}

export async function handleHttpError(error: unknown): Promise<boolean> {
  const axiosError = toAxiosError(error);
  const errorWithConfig = (axiosError ?? (typeof error === 'object' && error !== null ? (error as ErrorWithConfig) : undefined));

  // Check if this error should skip the global toast (component will handle it)
  const suppressToast =
    !!errorWithConfig?.config &&
    typeof errorWithConfig.config === 'object' &&
    (errorWithConfig.config as { suppressErrorToast?: boolean }).suppressErrorToast === true;
  if (suppressToast) {
    return false; // Don't show global toast, but continue rejection
  }
  // Compute title/body (friendly) from the error object
  const { title, body } = extractAxiosErrorMessage(error);

  // Normalize response data ONCE, reuse for both ID extraction and special-toast matching
  const raw = errorWithConfig?.response?.data;
  let normalized: unknown = raw;
  try { normalized = await normalizeAxiosErrorData(raw); } catch (e) { console.debug('normalizeAxiosErrorData', e); }

  // 1) If server sends structured file IDs for failures, also mark them errored in UI
  try {
    const ids = extractErrorFileIds(normalized);
    if (ids && ids.length > 0) {
      broadcastErroredFiles(ids);
    }
  } catch (e) {
    console.debug('extractErrorFileIds', e);
  }

  // 2) Generic-vs-special dedupe by endpoint
  const url =
    errorWithConfig?.config && typeof errorWithConfig.config === 'object'
      ? (errorWithConfig.config as AxiosRequestConfig).url
      : undefined;
  const status: number | undefined = errorWithConfig?.response?.status;
  const now = Date.now();
  const isSpecial =
    status === 422 ||
    status === 409 || // often actionable conflicts
    /Failed files:/.test(body) ||
    /invalid\/corrupted file\(s\)/i.test(body);

  if (isSpecial && url) {
    recentSpecialByEndpoint[url] = now;
  }
  if (!isSpecial && url) {
    const last = recentSpecialByEndpoint[url] || 0;
    if (now - last < SPECIAL_SUPPRESS_MS) {
      return true; // Suppress this error (deduplicated)
    }
  }

  // 3) Show specialized friendly toasts if matched; otherwise show the generic one
  let rawString: string | undefined;
  try {
    rawString =
      typeof normalized === 'string'
        ? normalized
        : JSON.stringify(normalized);
  } catch (e) {
    console.debug('extractErrorFileIds', e);
  }

  const handled = showSpecialErrorToast(rawString, { status });
  if (!handled) {
    const displayBody = clampText(body);
    alert({ alertType: 'error', title, body: displayBody, expandable: true, isPersistentPopup: false });
  }

  return false; // Error was handled with toast, continue normal rejection
}
