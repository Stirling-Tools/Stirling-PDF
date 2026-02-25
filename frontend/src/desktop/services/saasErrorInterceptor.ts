import { extractAxiosErrorMessage } from '@app/services/httpErrorUtils';
import { alert } from '@app/components/toast';

/**
 * Desktop implementation: intercepts errors from SaaS backend requests
 * and shows a specific "Cloud Processing Failed" alert.
 *
 * _isSaaSRequest is set by the desktop apiClientSetup interceptor when
 * a request is routed to the SaaS backend instead of the local backend.
 *
 * Returns true if the error was handled (suppresses further processing),
 * false if this is not a SaaS error.
 */
export function handleSaaSError(error: unknown): boolean {
  if ((error as any)?.config?._isSaaSRequest !== true) return false;

  const { title: originalTitle, body: originalBody } = extractAxiosErrorMessage(error);

  alert({
    alertType: 'error',
    title: 'Cloud Processing Failed',
    body: `This tool requires cloud processing but encountered an error: ${originalBody}. Please check your connection and try again.`,
    expandable: true,
    isPersistentPopup: false,
  });

  console.error('[saasErrorInterceptor] SaaS backend error:', { originalTitle, originalBody });
  return true;
}
