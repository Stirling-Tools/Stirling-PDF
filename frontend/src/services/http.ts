import axios from 'axios';
import { alert } from '../components/toast';
import { broadcastErroredFiles, extractErrorFileIds, normalizeAxiosErrorData } from './errorUtils';

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
    const statusText = error.response?.statusText || '';
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
    const bodyMsg = isUnhelpfulMessage(body) ? FRIENDLY_FALLBACK : body;
    const title = titleForStatus(status);
    return { title, body: bodyMsg };
  }
  try {
    const msg = (error?.message || String(error)) as string;
    return { title: 'Network error', body: isUnhelpfulMessage(msg) ? FRIENDLY_FALLBACK : msg };
  } catch {
    return { title: 'Network error', body: FRIENDLY_FALLBACK };
  }
}

// Install Axios response error interceptor
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { title, body } = extractAxiosErrorMessage(error);
    // If server sends structured file IDs for failures, also mark them errored in UI
    try {
      const raw = (error?.response?.data) as any;
      const data = await normalizeAxiosErrorData(raw);
      const ids = extractErrorFileIds(data);
      if (ids && ids.length > 0) broadcastErroredFiles(ids);
    } catch {}
    alert({ alertType: 'error', title, body, expandable: true, isPersistentPopup: false });
    return Promise.reject(error);
  }
);

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

export default axios;
export type { CancelTokenSource } from 'axios';


