import { loadPosthog } from "@app/services/posthogLoader";
import type { PosthogClient } from "@app/services/posthogLoader";

const DEV = process.env.NODE_ENV === "development";

function canCapture(ph: PosthogClient): boolean {
  if (typeof window === "undefined") return false;
  if (!ph.__loaded) return false;
  return (
    typeof ph.has_opted_in_capturing !== "function" ||
    ph.has_opted_in_capturing()
  );
}

export async function trackPdfUploaded(files: File[]): Promise<void> {
  try {
    if (!files) return;
    const ph = await loadPosthog();
    if (!ph || !canCapture(ph)) return;
    for (let i = 0; i < files.length; i++) {
      ph.capture("editor_pdf_uploaded", { source: "editor" });
    }
  } catch (error) {
    if (DEV) console.warn("[analytics] trackPdfUploaded failed", error);
  }
}

export async function trackEditorOperation(
  toolId: string,
  fileCount: number,
): Promise<void> {
  try {
    const ph = await loadPosthog();
    if (!ph || !canCapture(ph)) return;
    ph.capture("editor_operation", {
      source: "editor",
      tool: toolId,
      file_count: fileCount,
    });
  } catch (error) {
    if (DEV) console.warn("[analytics] trackEditorOperation failed", error);
  }
}
