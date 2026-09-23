import type { PostHog } from "posthog-js";

const DEV = process.env.NODE_ENV === "development";

/**
 * PostHog, loaded on demand. It only runs when the server enables analytics and
 * the user then consents, so a static import put 221 KB on everyone's first load
 * for a library most sessions never use. Captures before it loads are dropped,
 * as they already were before it was initialised.
 */
let client: PostHog | null = null;
let pending: Promise<PostHog> | null = null;

export function loadPosthog(): Promise<PostHog> {
  pending ??= import("posthog-js").then(({ default: posthog }) => {
    client = posthog;
    return posthog;
  });
  return pending;
}

/** The client if it has been loaded, without loading it. */
export function loadedPosthog(): PostHog | null {
  return client;
}

function capturingClient(): PostHog | null {
  if (typeof window === "undefined" || !client) return null;
  const ph = client as unknown as {
    __loaded?: boolean;
    has_opted_in_capturing?: () => boolean;
  };
  if (!ph.__loaded) return null;
  const optedIn =
    typeof ph.has_opted_in_capturing !== "function" ||
    ph.has_opted_in_capturing();
  return optedIn ? client : null;
}

export function trackPdfUploaded(files: File[]): void {
  try {
    const posthog = capturingClient();
    if (!posthog || !files) return;
    for (let i = 0; i < files.length; i++) {
      posthog.capture("editor_pdf_uploaded", { source: "editor" });
    }
  } catch (error) {
    if (DEV) console.warn("[analytics] trackPdfUploaded failed", error);
  }
}

export function trackEditorOperation(toolId: string, fileCount: number): void {
  try {
    const posthog = capturingClient();
    if (!posthog) return;
    posthog.capture("editor_operation", {
      source: "editor",
      tool: toolId,
      file_count: fileCount,
    });
  } catch (error) {
    if (DEV) console.warn("[analytics] trackEditorOperation failed", error);
  }
}
