import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { alert } from '../components/toast';
import { broadcastErroredFiles, extractErrorFileIds, normalizeAxiosErrorData } from './errorUtils';
import { showSpecialErrorToast } from './specialErrorToasts';

const FRIENDLY_FALLBACK = 'There was an error processing your request.';

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

// Create axios instance with default config similar to SaaS client
const __globalAny = (typeof window !== 'undefined' ? (window as any) : undefined);

type ExtendedAxiosInstance = AxiosInstance & {
  CancelToken: typeof axios.CancelToken;
  isCancel: typeof axios.isCancel;
};

// Reuse existing client across HMR reloads to avoid duplicate interceptors
const __PREV_CLIENT: ExtendedAxiosInstance | undefined = __globalAny?.__SPDF_HTTP_CLIENT as ExtendedAxiosInstance | undefined;

const apiClient: ExtendedAxiosInstance = (__PREV_CLIENT || axios.create({
  baseURL: (import.meta as any)?.env?.VITE_API_BASE_URL || '/',
  responseType: 'json',
  withCredentials: true,
})) as ExtendedAxiosInstance;

// Augment instance with axios static helpers for backwards compatibility
(apiClient as any).CancelToken = axios.CancelToken;
(apiClient as any).isCancel = axios.isCancel;

// Install Axios response error interceptor on the instance (guard against double-registration in HMR)
if (__globalAny?.__SPDF_HTTP_ERR_INTERCEPTOR_ID !== undefined && __PREV_CLIENT) {
  try { __PREV_CLIENT.interceptors.response.eject(__globalAny.__SPDF_HTTP_ERR_INTERCEPTOR_ID); } catch (_e) { void _e; }
}

const __recentSpecialByEndpoint: Record<string, number> = (__globalAny?.__SPDF_RECENT_SPECIAL || {});
const __SPECIAL_SUPPRESS_MS = 1500; // brief window to suppress generic duplicate after special toast
const __INTERCEPTOR_ID__ = apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { title, body } = extractAxiosErrorMessage(error);
    // If server sends structured file IDs for failures, also mark them errored in UI
    try {
      const raw = (error?.response?.data) as any;
      const data = await normalizeAxiosErrorData(raw);
      const ids = extractErrorFileIds(data);
      if (ids && ids.length > 0) {
        broadcastErroredFiles(ids);
      }
    } catch (_e) { void _e; }

    // Generic-vs-special dedupe by endpoint
    const url: string | undefined = error?.config?.url;
    const status: number | undefined = error?.response?.status;
    const now = Date.now();
    const isSpecial = status === 422 || /Failed files:/.test(body) || /invalid\/corrupted file\(s\)/i.test(body);
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

    // Show specialized friendly toasts if matched; otherwise show the generic one
    const raw = (error?.response?.data) as any;
    let rawString: string | undefined;
    try {
      if (typeof raw === 'string') rawString = raw;
      else rawString = await normalizeAxiosErrorData(raw).then((d) => (typeof d === 'string' ? d : JSON.stringify(d)));
    } catch { /* ignore */ }
    const handled = showSpecialErrorToast(rawString, { status });
    if (!handled) {
      alert({ alertType: 'error', title, body, expandable: true, isPersistentPopup: false });
    }
    return Promise.reject(error);
  }
);
if (__globalAny) {
  __globalAny.__SPDF_HTTP_ERR_INTERCEPTOR_ID = __INTERCEPTOR_ID__;
  __globalAny.__SPDF_RECENT_SPECIAL = __recentSpecialByEndpoint;
  __globalAny.__SPDF_HTTP_CLIENT = apiClient;
}

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
    alert({ alertType: 'error', title, body, expandable: true, isPersistentPopup: false });
  }
  return res;
}


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


