const DEV = process.env.NODE_ENV === "development";

// posthog-js is ~230 KB most sessions never send with. usePosthogTracking owns
// loading and configuring it; capture only uses the client that hook publishes,
// so nothing downloads the module while analytics is off.
type Posthog = typeof import("posthog-js").default;

let activePosthog: Posthog | null = null;

/** Publishes the configured client, or null while analytics is disabled. */
export function setActivePosthog(posthog: Posthog | null): void {
  activePosthog = posthog;
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
  const posthog = activePosthog;
  if (!posthog || !canCapture(posthog)) return;
  try {
    posthog.capture(event, props);
  } catch (error) {
    if (DEV) console.warn(`[analytics] ${tool} failed`, error);
  }
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
