import { describe, it, expect, vi, beforeEach } from "vitest";

const capture = vi.fn();
let optedIn = true;

vi.mock("posthog-js", () => ({
  default: {
    __loaded: true,
    has_opted_in_capturing: () => optedIn,
    capture: (...args: unknown[]) => capture(...args),
  },
}));

import {
  trackPdfUploaded,
  trackEditorOperation,
} from "@app/services/analytics";

/** Tracking is fire-and-forget now that posthog-js loads on demand, so the
 *  assertions flush the queued dynamic import first. */
const flushTracking = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

function pdf(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

describe("analytics", () => {
  beforeEach(() => {
    capture.mockClear();
    optedIn = true;
  });

  it("captures one event per uploaded PDF (no dedup)", async () => {
    trackPdfUploaded([pdf("a.pdf"), pdf("a.pdf"), pdf("b.pdf")]);
    await flushTracking();
    expect(capture).toHaveBeenCalledTimes(3);
    expect(capture).toHaveBeenCalledWith("editor_pdf_uploaded", {
      source: "editor",
    });
  });

  it("counts every uploaded file regardless of type", async () => {
    trackPdfUploaded([
      new File(["x"], "a.png", { type: "image/png" }),
      pdf("b.pdf"),
    ]);
    await flushTracking();
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("captures one event per editor operation run", async () => {
    trackEditorOperation("compress", 3);
    await flushTracking();
    expect(capture).toHaveBeenCalledWith("editor_operation", {
      source: "editor",
      tool: "compress",
      file_count: 3,
    });
  });

  it("does not capture when opted out", async () => {
    optedIn = false;
    trackPdfUploaded([pdf("a.pdf")]);
    trackEditorOperation("compress", 1);
    await flushTracking();
    expect(capture).not.toHaveBeenCalled();
  });
});
