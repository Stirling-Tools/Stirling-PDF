/** Transport behind {@code apiClient.local}: issues the request and returns the raw
 *  Response. A seam - desktop shadows it with its native client. Pass a joined URL. */
export function localFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}
