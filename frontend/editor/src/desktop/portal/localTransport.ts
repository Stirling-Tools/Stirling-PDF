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

/** Native client, not webview fetch: only it runs the operation router that picks
 *  the backend. Non-2xx returns, so the portal's unwrap raises it once, not twice. */
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
