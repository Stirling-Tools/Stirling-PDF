import { alert } from '@app/components/toast';

interface ErrorToastMapping {
  regex: RegExp;
  i18nKey: string;
  defaultMessage: string;
}

// Centralized list of special backend error message patterns → friendly, translated toasts
const MAPPINGS: ErrorToastMapping[] = [
  {
    regex: /pdf contains an encryption dictionary/i,
    i18nKey: 'errors.encryptedPdfMustRemovePassword',
    defaultMessage: 'This PDF is encrypted. Please unlock it using the Unlock PDF Forms tool.'
  },
  {
    regex: /the pdf document is passworded and either the password was not provided or was incorrect/i,
    i18nKey: 'errors.incorrectPasswordProvided',
    defaultMessage: 'The PDF password is incorrect or not provided.'
  },
];

function titleForStatus(status?: number): string {
  if (!status) return 'Network error';
  if (status >= 500) return 'Server error';
  if (status >= 400) return 'Request error';
  return 'Request failed';
}

/**
 * Match a raw backend error string against known patterns and show a friendly toast.
 * Returns true if a special toast was shown, false otherwise.
 */
export function showSpecialErrorToast(rawError: string | undefined, options?: { status?: number }): boolean {
  const message = (rawError || '').toString();
  if (!message) return false;

  for (const mapping of MAPPINGS) {
    if (mapping.regex.test(message)) {
      // Best-effort translation without hard dependency on i18n config
      let body = mapping.defaultMessage;
      try {
        const anyGlobal: any = (globalThis as any);
        const i18next = anyGlobal?.i18next;
        if (i18next && typeof i18next.t === 'function') {
          body = i18next.t(mapping.i18nKey, { defaultValue: mapping.defaultMessage });
        }
      } catch { /* ignore translation errors */ }
      const title = titleForStatus(options?.status);
      alert({ alertType: 'error', title, body, expandable: true, isPersistentPopup: false });
      return true;
    }
  }
  return false;
}


