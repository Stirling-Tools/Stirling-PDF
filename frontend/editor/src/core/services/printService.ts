/**
 * Prints a PDF this app produced (an imposed layout) rather than the document
 * the viewer happens to be showing, so the bytes go to a hidden frame instead
 * of through the viewer's own print path.
 */
let activeFrame: HTMLIFrameElement | null = null;
let activeUrl: string | null = null;

/**
 * Drops the hidden frame and the object URL behind it. Until this runs, the
 * last printed PDF stays reachable, so callers that are done with their preview
 * use it rather than waiting for the next print.
 */
function releasePrintFrame(): void {
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
  activeFrame?.remove();
  activeFrame = null;
}

// A frame whose document never loads would otherwise leave the caller busy.
const LOAD_TIMEOUT_MS = 15_000;

/**
 * Resolves once the browser has been handed the document.
 *
 * The frame outlives this promise: browsers keep it alive while their print
 * preview is open, and revoking the URL under it would blank that preview. The
 * next print, a load failure, the preview closing, or the page unloading
 * releases it.
 *
 * `signal` covers the gap before the handoff. Aborting while the frame loads
 * detaches this job's callbacks, so a job the reader cancelled cannot open a
 * preview later. Once print() has been called the document belongs to the
 * browser's preview, which this service cannot recall.
 */
export function printPdfBlob(
  blob: Blob,
  fileName: string,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Print cancelled", "AbortError"));
  }
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.position = "absolute";
  frame.style.display = "none";
  frame.title = fileName;

  const printed = new Promise<void>((resolve, reject) => {
    let timeout = 0;

    const detach = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };

    // Cleanup stays scoped to the frame this job created, so a cancelled job
    // cannot remove the frame a newer print is using.
    function onAbort() {
      detach();
      frame.onload = null;
      frame.onerror = null;
      if (activeFrame === frame) {
        releasePrintFrame();
      } else {
        frame.remove();
      }
      reject(new DOMException("Print cancelled", "AbortError"));
    }

    const fail = (error: Error) => {
      detach();
      if (activeFrame === frame) {
        releasePrintFrame();
      }
      reject(error);
    };

    frame.onload = () => {
      // about:blank loads first; only the blob document is printable.
      if (frame.src !== url) {
        return;
      }
      try {
        const contentWindow = frame.contentWindow;
        if (!contentWindow) {
          throw new Error("Print frame has no window");
        }
        window.clearTimeout(timeout);
        // The preview owns the frame until it closes, so cleanup hangs off the
        // event that reports that. Withholding the revoke until then is what
        // keeps the preview populated, and the listener goes on before the
        // call because a blocking print() delivers the event while it runs.
        try {
          contentWindow.addEventListener(
            "afterprint",
            () => {
              if (activeFrame === frame) {
                releasePrintFrame();
              }
            },
            { once: true },
          );
        } catch {
          // Same-origin blob documents accept the listener; the next print
          // still releases a frame that refuses it.
        }
        if (signal?.aborted) {
          onAbort();
          return;
        }
        contentWindow.focus();
        contentWindow.print();
        // The frame may already be gone: a blocking print() can deliver
        // afterprint before it returns.
        detach();
        resolve();
      } catch (thrown) {
        fail(thrown instanceof Error ? thrown : new Error(String(thrown)));
      }
    };
    frame.onerror = () => fail(new Error("Failed to load the print frame"));
    timeout = window.setTimeout(
      () => fail(new Error("The print frame did not load")),
      LOAD_TIMEOUT_MS,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
  });

  releasePrintFrame();
  activeFrame = frame;
  activeUrl = url;
  document.body.appendChild(frame);
  frame.src = url;

  return printed;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", releasePrintFrame, { once: true });
}
