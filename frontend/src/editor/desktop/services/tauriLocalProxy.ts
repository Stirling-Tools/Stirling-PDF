import { invoke } from "@tauri-apps/api/core";

// Fast path for localhost binary traffic: moves raw bytes via a Rust command
// instead of plugin-http's per-byte number-array IPC (~3.5x size bloat).
// See src-tauri/src/commands/local_proxy.rs.
//
// A single runtime failure trips a session-wide circuit breaker and all
// subsequent requests fall back to plugin-http transparently.
let fastTransportUnavailable = false;

// Trip the circuit breaker so the rest of the session uses plugin-http.
export function markFastTransportUnavailable(): void {
  fastTransportUnavailable = true;
}

function isLoopbackUrl(url: string): boolean {
  try {
    let host = new URL(url).hostname.toLowerCase();
    // URL.hostname wraps IPv6 literals in brackets; strip them to compare.
    if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
    return (
      host === "localhost" ||
      host === "::1" ||
      /^127(?:\.\d{1,3}){3}$/.test(host) // 127.0.0.0/8 loopback range
    );
  } catch {
    return false;
  }
}

/**
 * Whether a request should use the raw-bytes localhost fast path.
 *
 * Only localhost requests that actually move a PDF qualify: a binary upload
 * (FormData) or a binary download (blob/arraybuffer response). Everything else
 * — remote/cloud/self-hosted requests, JSON/GET calls, anything with no PDF
 * body — returns false and stays on the normal plugin-http path untouched.
 */
export function shouldUseFastLocalTransport(
  url: string,
  responseType: string | undefined,
  data: unknown,
): boolean {
  if (fastTransportUnavailable) return false;
  if (!isLoopbackUrl(url)) return false;
  const hasBinaryUpload =
    typeof FormData !== "undefined" && data instanceof FormData;
  const wantsBinaryDownload =
    responseType === "blob" || responseType === "arraybuffer";
  return hasBinaryUpload || wantsBinaryDownload;
}

interface ProxyResponseMeta {
  status: number;
  statusText: string;
  headers: [string, string][];
}

// Statuses that must carry a null body (per the fetch spec). 1xx are excluded:
// the Response constructor only accepts 200–599, and they never reach here.
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

// Headers describing the ORIGINAL transfer encoding/length. They're meaningless
// (and can mismatch) once the bytes are handed to a fresh Response, which
// recomputes them — so strip them when reconstructing.
const STRIP_RESPONSE_HEADERS = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
]);

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/**
 * Send a request to the localhost backend via the raw-bytes Rust proxy and
 * return a standard `Response`, so all downstream handling in tauriHttpClient
 * (status checks, body parsing per responseType, response interceptors) is
 * identical to the normal fetch path.
 *
 * Frame layout (both directions): [u32 BE meta_len][meta JSON][raw body].
 */
export async function fetchViaLocalProxy(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: BodyInit | undefined,
  signal?: AbortSignal,
): Promise<Response> {
  if (signal?.aborted) throw abortError();

  // Normalise the body to raw bytes. Using Request also generates the correct
  // multipart Content-Type (with boundary) for FormData, matching what the
  // browser/native fetch would otherwise send.
  const outHeaders: Record<string, string> = { ...headers };
  let bodyBytes = new Uint8Array(0);
  if (body !== undefined) {
    const probe = new Request("http://localhost/", { method: "POST", body });
    bodyBytes = new Uint8Array(await probe.arrayBuffer());
    // Adopt the probe's Content-Type ONLY when the caller didn't set one. This
    // captures the multipart boundary for FormData (executeRequest deletes the
    // header for FormData) without clobbering an explicit type such as
    // application/json that the caller already set on a JSON body.
    const hasContentType = Object.keys(outHeaders).some(
      (h) => h.toLowerCase() === "content-type",
    );
    const contentType = probe.headers.get("content-type");
    if (contentType && !hasContentType) {
      outHeaders["Content-Type"] = contentType;
    }
  }

  const metaBytes = new TextEncoder().encode(
    JSON.stringify({ method, url, headers: Object.entries(outHeaders) }),
  );

  const frame = new Uint8Array(4 + metaBytes.length + bodyBytes.length);
  new DataView(frame.buffer).setUint32(0, metaBytes.length, false);
  frame.set(metaBytes, 4);
  frame.set(bodyBytes, 4 + metaBytes.length);

  const invokePromise = invoke<ArrayBuffer>("proxy_local_pdf_request", frame);
  // The Rust command can't be cancelled mid-flight, but honour the signal on
  // the JS side so an abort unblocks the caller (the discarded result is GC'd).
  const respBuf = signal
    ? await new Promise<ArrayBuffer>((resolve, reject) => {
        const onAbort = () => reject(abortError());
        signal.addEventListener("abort", onAbort, { once: true });
        invokePromise.then(
          (value) => {
            signal.removeEventListener("abort", onAbort);
            resolve(value);
          },
          (error) => {
            signal.removeEventListener("abort", onAbort);
            reject(error);
          },
        );
      })
    : await invokePromise;

  const respBytes = new Uint8Array(respBuf);
  const metaLen = new DataView(respBuf).getUint32(0, false);
  const respMeta: ProxyResponseMeta = JSON.parse(
    new TextDecoder().decode(respBytes.subarray(4, 4 + metaLen)),
  );
  const respBody = respBytes.subarray(4 + metaLen);

  const responseHeaders = respMeta.headers.filter(
    ([name]) => !STRIP_RESPONSE_HEADERS.has(name.toLowerCase()),
  );

  return new Response(
    NULL_BODY_STATUSES.has(respMeta.status) ? null : respBody,
    {
      status: respMeta.status,
      statusText: respMeta.statusText,
      headers: responseHeaders,
    },
  );
}
