import apiClient from "@app/services/apiClient";
import type {
  TauriHttpError,
  TauriHttpResponse,
} from "@app/services/tauriHttpClient";

function toResponse(res: TauriHttpResponse<ArrayBuffer>): Response {
  return new Response(res.data, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

/**
 * Desktop transport for {@code apiClient.local}. Goes through the native HTTP
 * client rather than the webview's fetch: only the native client runs the
 * operation router, which resolves the backend for the current connection mode
 * (local bundled, self-hosted server, or the cloud when signed into it), and a
 * webview fetch would be same-origin against the app itself.
 *
 * <p>Non-2xx is returned rather than thrown, and the error toast suppressed,
 * because the portal's own unwrap turns the Response into an HttpError and
 * raises the 401 and entitlement paths from it. Throwing here would bypass both
 * and report the failure twice.
 */
export async function localFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    const res = await apiClient.request<ArrayBuffer>({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string> | undefined,
      data: init.body,
      responseType: "arraybuffer",
      signal: init.signal ?? undefined,
      suppressErrorToast: true,
    });
    return toResponse(res);
  } catch (error) {
    const response = (error as TauriHttpError).response as
      | TauriHttpResponse<ArrayBuffer>
      | undefined;
    if (response) return toResponse(response);
    throw error;
  }
}
