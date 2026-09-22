const DEV = process.env.NODE_ENV === "development";

// posthog-js loads on demand: these fire-and-forget callers run on the upload
// and tool paths, and the module is ~230 KB most sessions never send with.
type Posthog = typeof import("posthog-js").default;

let posthogPromise: Promise<Posthog | null> | null = null;

function loadPosthog(): Promise<Posthog | null> {
  posthogPromise ??= import("posthog-js")
    .then((mod) => mod.default)
    .catch(() => null);
  return posthogPromise;
}

function canCapture(posthog: Posthog): boolean {
  if (typeof window === "undefined") return false;
  const ph = posthog as unknown as {
    __loaded?: boolean;
    has_opted_in_capturing?: () => boolean;
  };
  if (!ph.__loaded) return false;
  return (
    typeof ph.has_opted_in_capturing !== "function" ||
    ph.has_opted_in_capturing()
  );
}

function capture(
  tool: string,
  event: string,
  props: Record<string, unknown>,
): void {
  void (async () => {
    try {
      const posthog = await loadPosthog();
      if (!posthog || !canCapture(posthog)) return;
      posthog.capture(event, props);
    } catch (error) {
      if (DEV) console.warn(`[analytics] ${tool} failed`, error);
    }
  })();
}

export function trackPdfUploaded(files: File[]): void {
  if (!files) return;
  for (let i = 0; i < files.length; i++) {
    capture("trackPdfUploaded", "editor_pdf_uploaded", { source: "editor" });
  }
}

export function trackEditorOperation(toolId: string, fileCount: number): void {
  capture("trackEditorOperation", "editor_operation", {
    source: "editor",
    tool: toolId,
    file_count: fileCount,
  });
}
