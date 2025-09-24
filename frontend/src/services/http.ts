import axios from 'axios';
import { alert } from '../components/toast';

function extractAxiosErrorMessage(error: any): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const statusText = error.response?.statusText || 'Request Error';
    const body = ((): string => {
      const data = error.response?.data as any;
      if (!data) return '';
      if (typeof data === 'string') return data;
      if (data?.message) return data.message as string;
      try { return JSON.stringify(data); } catch { return ''; }
    })();
    return `${status ?? ''} ${statusText}${body ? `: ${body}` : ''}`.trim();
  }
  try {
    return (error?.message || String(error)) as string;
  } catch {
    return 'Unknown network error';
  }
}

// Install Axios response error interceptor
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const msg = extractAxiosErrorMessage(error);
    alert({
      alertType: 'error',
      title: 'Request failed',
      body: msg,
      expandable: true,
      isPersistentPopup: false,
    });
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
    alert({
      alertType: 'error',
      title: `Request failed (${res.status})`,
      body: detail || res.statusText,
      expandable: true,
      isPersistentPopup: false,
    });
  }
  return res;
}

export default axios;
export type { CancelTokenSource } from 'axios';


