import type { Page } from "@playwright/test";

/**
 * WebKit elides Blob-backed multipart part bodies from `route.request().postData()`, so read them
 * at the XHR/fetch seam instead; part headers stay readable on every engine.
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
