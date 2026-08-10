import type { Page } from "@playwright/test";

/**
 * Read the body of a Blob-backed `multipart/form-data` part in a way that works
 * on every engine.
 *
 * Playwright cannot surface Blob-backed multipart bodies through WebKit's
 * inspector protocol: `route.request().postData()` returns only the part
 * headers with every part body elided (a ~330 byte skeleton), while the browser
 * puts the full body on the wire. Chromium and Firefox report the whole body,
 * so a spec that asserts on a JSON part via `postData()` passes on two engines
 * and fails on the third for reasons that have nothing to do with the product.
 *
 * Observing the part one layer earlier - at the XHR/fetch seam, which is the
 * last thing the app itself controls - is identical on all three engines.
 * Pair it with an assertion on the multipart envelope (readable everywhere) so
 * the part's name and Content-Type are still checked at the network seam.
 */

const STORE_KEY = "__capturedMultipartParts";

/**
 * Start recording the text of the `partName` part of any `FormData` the page
 * posts, keyed by the request's URL pathname. Must be called before navigation.
 */
export async function captureMultipartPart(
  page: Page,
  partName: string,
): Promise<void> {
  await page.addInitScript((name: string) => {
    const store: Record<string, string> = {};
    (window as unknown as Record<string, unknown>).__capturedMultipartParts =
      store;

    const record = (url: string, body: unknown): void => {
      if (!(body instanceof FormData)) return;
      const part = body.get(name);
      if (!(part instanceof Blob)) return;
      let pathname: string;
      try {
        pathname = new URL(url, window.location.href).pathname;
      } catch {
        return;
      }
      void part.text().then((text) => {
        store[pathname] = text;
      });
    };

    // axios posts through XHR; keep the URL from open() so the capture stays
    // keyed by endpoint and a commit to the wrong URL still fails the spec.
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      ...args: unknown[]
    ) {
      (this as unknown as Record<string, unknown>).__capturedUrl = String(
        args[1] ?? "",
      );
      return (originalOpen as (...a: unknown[]) => unknown).apply(this, args);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest,
      ...args: unknown[]
    ) {
      const url = (this as unknown as Record<string, unknown>).__capturedUrl;
      record(typeof url === "string" ? url : "", args[0]);
      return (originalSend as (...a: unknown[]) => unknown).apply(this, args);
    };

    // Mirror it on fetch so the capture survives if the api client moves off XHR.
    const originalFetch = window.fetch;
    window.fetch = function (
      this: typeof window,
      input: RequestInfo | URL,
      init?: RequestInit,
    ) {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      record(url, init?.body);
      return originalFetch.call(this, input, init);
    };
  }, partName);
}

/** The captured part text for `pathname`, or undefined if nothing posted yet. */
export function readCapturedPart(
  page: Page,
  pathname: string,
): Promise<string | undefined> {
  return page.evaluate(
    ([key, path]) =>
      (
        (window as unknown as Record<string, unknown>)[key] as
          | Record<string, string>
          | undefined
      )?.[path],
    [STORE_KEY, pathname] as const,
  );
}
