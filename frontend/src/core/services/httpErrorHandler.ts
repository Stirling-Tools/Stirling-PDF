// frontend/src/services/httpErrorHandler.ts
import axios from 'axios';
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

// Module-scoped state to reduce global variable usage
const recentSpecialByEndpoint: Record<string, number> = {};
const SPECIAL_SUPPRESS_MS = 1500; // brief window to suppress generic duplicate after special toast

/**
 * Handles HTTP errors with toast notifications and file error broadcasting
 * Returns true if the error should be suppressed (deduplicated), false otherwise
 */
export async function handleHttpError(error: any): Promise<boolean> {
  const skipAuthRedirect = error?.config?.skipAuthRedirect === true;
  // Check if this error should skip the global toast (component will handle it)
  if (error?.config?.suppressErrorToast === true) {
    return false; // Don't show global toast, but continue rejection
  }

  // Handle 401 authentication errors
  const status: number | undefined = error?.response?.status;
  if (status === 401) {
    const pathname = window.location.pathname;

    // Check if we're already on an auth page
    const isAuthPage = pathname.includes('/login') ||
                      pathname.includes('/signup') ||
                      pathname.includes('/auth/') ||
                      pathname.includes('/invite/');

    // If not on auth page, redirect to login with expired session message
    if (!isAuthPage && !skipAuthRedirect) {
      console.debug('[httpErrorHandler] 401 detected, redirecting to login');
      // Store the current location so we can redirect back after login
      const currentLocation = window.location.pathname + window.location.search;
      // Redirect to login with state (only show expired when a JWT existed)
      let hadStoredJwt = false;
      try {
        hadStoredJwt = Boolean(localStorage.getItem('stirling_jwt'));
      } catch {
        // ignore storage access failures
      }
      const expiredPrefix = hadStoredJwt ? 'expired=true&' : '';
      window.location.href = `/login?${expiredPrefix}from=${encodeURIComponent(currentLocation)}`;
      return true; // Suppress toast since we're redirecting
    }

    // On auth pages, suppress the toast (user is already trying to authenticate)
    console.debug('[httpErrorHandler] Suppressing 401 on auth page:', pathname);
    return true;
  }

  // Handle SaaS backend errors (desktop only) - provide specific error message
  const baseURL = error?.config?.baseURL;
  if (baseURL && typeof baseURL === 'string') {
    // Check if this is a SaaS backend request
    // STIRLING_SAAS_BACKEND_API_URL is typically something like 'https://api.stirlingpdf.com' or contains 'saas'
    const isSaaSBackend = baseURL.includes('saas-backend-api') || baseURL.includes('api.stirlingpdf');

    if (isSaaSBackend) {
      const { title: originalTitle, body: originalBody } = extractAxiosErrorMessage(error);

      alert({
        alertType: 'error',
        title: 'Cloud Processing Failed',
        body: `This tool requires cloud processing but encountered an error: ${originalBody}. Please check your connection and try again.`,
        expandable: true,
        isPersistentPopup: false,
      });

      console.error('[httpErrorHandler] SaaS backend error:', { status, baseURL, originalTitle, originalBody });
      return true; // Handled - suppress further processing
    }
  }

  // Compute title/body (friendly) from the error object
  const { title, body } = extractAxiosErrorMessage(error);

  // Normalize response data ONCE, reuse for both ID extraction and special-toast matching
  const raw = (error?.response?.data) as any;
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
