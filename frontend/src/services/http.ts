// frontend/src/services/http.ts
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { alert } from '../components/toast';
import { broadcastErroredFiles, extractErrorFileIds, normalizeAxiosErrorData } from './errorUtils';
import { showSpecialErrorToast } from './specialErrorToasts';

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

function extractAxiosErrorMessage(error: any): { title: string; body: string } {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const _statusText = error.response?.statusText || '';
    let parsed: any = undefined;
    const raw = error.response?.data;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { /* keep as string */ }
    } else {
      parsed = raw;
    }
    const extractIds = (): string[] | undefined => {
      if (Array.isArray(parsed?.errorFileIds)) return parsed.errorFileIds as string[];
      const rawText = typeof raw === 'string' ? raw : '';
      const uuidMatches = rawText.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g);
      return uuidMatches && uuidMatches.length > 0 ? Array.from(new Set(uuidMatches)) : undefined;
    };

    const body = ((): string => {
      const data = parsed;
      if (!data) return typeof raw === 'string' ? raw : '';
      const ids = extractIds();
      if (ids && ids.length > 0) return `Failed files: ${ids.join(', ')}`;
      if (data?.message) return data.message as string;
      if (typeof raw === 'string') return raw;
      try { return JSON.stringify(data); } catch { return ''; }
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
    const msg = (error?.message || String(error)) as string;
    return { title: 'Network error', body: isUnhelpfulMessage(msg) ? FRIENDLY_FALLBACK : msg };
  } catch (e) {
    // ignore extraction errors
    console.debug('extractAxiosErrorMessage', e);
    return { title: 'Network error', body: FRIENDLY_FALLBACK };
  }
}

// ---------- Axios instance creation ----------
const __globalAny = (typeof window !== 'undefined' ? (window as any) : undefined);

type ExtendedAxiosInstance = AxiosInstance & {
  CancelToken: typeof axios.CancelToken;
  isCancel: typeof axios.isCancel;
};

const __PREV_CLIENT: ExtendedAxiosInstance | undefined =
  __globalAny?.__SPDF_HTTP_CLIENT as ExtendedAxiosInstance | undefined;

let __createdClient: any;
if (__PREV_CLIENT) {
  __createdClient = __PREV_CLIENT;
} else if (typeof (axios as any)?.create === 'function') {
  try {
    __createdClient = (axios as any).create();
  } catch (e) {
    console.debug('createClient', e);
    __createdClient = axios as any;
  }
} else {
  __createdClient = axios as any;
}

const apiClient: ExtendedAxiosInstance = (__createdClient || (axios as any)) as ExtendedAxiosInstance;

// Augment instance with axios static helpers for backwards compatibility 
if (apiClient) {
  try { (apiClient as any).CancelToken = (axios as any).CancelToken; } catch (e) { console.debug('setCancelToken', e); }
  try { (apiClient as any).isCancel = (axios as any).isCancel; } catch (e) { console.debug('setIsCancel', e); }
}

// ---------- Base defaults  ----------
try {
  const env = (import.meta as any)?.env || {};
  apiClient.defaults.baseURL = env?.VITE_API_BASE_URL ?? '/';
  apiClient.defaults.responseType = 'json';
  // If OSS relies on cookies, uncomment:
  // apiClient.defaults.withCredentials = true;
  // Sensible timeout to avoid “forever hanging”:
  apiClient.defaults.timeout = 20000;
} catch (e) {
  console.debug('setDefaults', e);
  apiClient.defaults.baseURL = apiClient.defaults.baseURL || '/';
  apiClient.defaults.responseType = apiClient.defaults.responseType || 'json';
  apiClient.defaults.timeout = apiClient.defaults.timeout || 20000;
}

// ---------- Install a single response error interceptor (dedup + UX) ----------
if (__globalAny?.__SPDF_HTTP_ERR_INTERCEPTOR_ID !== undefined && __PREV_CLIENT) {
  try {
    __PREV_CLIENT.interceptors.response.eject(__globalAny.__SPDF_HTTP_ERR_INTERCEPTOR_ID);
  } catch (e) {
    console.debug('ejectInterceptor', e);
  }
}

const __recentSpecialByEndpoint: Record<string, number> = (__globalAny?.__SPDF_RECENT_SPECIAL || {});
const __SPECIAL_SUPPRESS_MS = 1500; // brief window to suppress generic duplicate after special toast

const __INTERCEPTOR_ID__ = apiClient?.interceptors?.response?.use
  ? apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
      // Compute title/body (friendly) from the error object
      const { title, body } = extractAxiosErrorMessage(error);

      // Normalize response data ONCE, reuse for both ID extraction and special-toast matching
      const raw = (error?.response?.data);
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
      const url: string | undefined = error?.config?.url;
      const status: number | undefined = error?.response?.status;
      const now = Date.now();
      const isSpecial =
        status === 422 ||
        status === 409 || // often actionable conflicts
        body.includes('Failed files:') ||
        /invalid\/corrupted file\(s\)/i.test(body);

      if (isSpecial && url) {
        __recentSpecialByEndpoint[url] = now;
        if (__globalAny) __globalAny.__SPDF_RECENT_SPECIAL = __recentSpecialByEndpoint;
      }
      if (!isSpecial && url) {
        const last = __recentSpecialByEndpoint[url] || 0;
        if (now - last < __SPECIAL_SUPPRESS_MS) {
          return Promise.reject(error);
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

      return Promise.reject(error);
    }
  )
  : undefined as any;

if (__globalAny) {
  __globalAny.__SPDF_HTTP_ERR_INTERCEPTOR_ID = __INTERCEPTOR_ID__;
  __globalAny.__SPDF_RECENT_SPECIAL = __recentSpecialByEndpoint;
  __globalAny.__SPDF_HTTP_CLIENT = apiClient;
}

// ---------- Fetch helper ----------
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { credentials: init?.credentials ?? 'include', ...init });

  if (!res.ok) {
    let detail = '';
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        detail = typeof data === 'string' ? data : (data?.message || JSON.stringify(data));
      } else {
        detail = await res.text();
      }
    } catch {
      // ignore parse errors
    }

    const title = titleForStatus(res.status);
    const body = isUnhelpfulMessage(detail || res.statusText) ? FRIENDLY_FALLBACK : (detail || res.statusText);
    alert({ alertType: 'error', title, body: clampText(body), expandable: true, isPersistentPopup: false });

    // Important: match Axios semantics so callers can try/catch
    throw new Error(body || res.statusText);
  }

  return res;
}

// ---------- Convenience API surface and exports ----------
export const api = {
  get: apiClient.get,
  post: apiClient.post,
  put: apiClient.put,
  patch: apiClient.patch,
  delete: apiClient.delete,
  request: apiClient.request,
};

export default apiClient;
export type { CancelTokenSource } from 'axios';