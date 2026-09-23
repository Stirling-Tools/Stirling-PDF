import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  loadPosthog,
  trackPdfUploaded,
  trackEditorOperation,
} from "@app/services/analytics";

function pdf(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

describe("analytics", () => {
  // PostHog is loaded on demand, and only once analytics is enabled; nothing can
  // capture until then, so the capture cases start from a loaded client.
  beforeAll(async () => {
    await loadPosthog();
  });

  beforeEach(() => {
    capture.mockClear();
    optedIn = true;
  });

  it("captures one event per uploaded PDF (no dedup)", () => {
    trackPdfUploaded([pdf("a.pdf"), pdf("a.pdf"), pdf("b.pdf")]);
    expect(capture).toHaveBeenCalledTimes(3);
    expect(capture).toHaveBeenCalledWith("editor_pdf_uploaded", {
      source: "editor",
    });
  });

  it("counts every uploaded file regardless of type", () => {
    trackPdfUploaded([
      new File(["x"], "a.png", { type: "image/png" }),
      pdf("b.pdf"),
    ]);
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("captures one event per editor operation run", () => {
    trackEditorOperation("compress", 3);
    expect(capture).toHaveBeenCalledWith("editor_operation", {
      source: "editor",
      tool: "compress",
      file_count: 3,
    });
  });

  it("does not capture when opted out", () => {
    optedIn = false;
    trackPdfUploaded([pdf("a.pdf")]);
    trackEditorOperation("compress", 1);
    expect(capture).not.toHaveBeenCalled();
  });
});

/** A fresh module, so this holds whatever order the file runs in. */
it("captures nothing, and does not throw, before PostHog has loaded", async () => {
  vi.resetModules();
  const analytics = await import("@app/services/analytics");
  capture.mockClear();

  analytics.trackPdfUploaded([pdf("a.pdf")]);
  analytics.trackEditorOperation("compress", 1);

  expect(capture).not.toHaveBeenCalled();
  expect(analytics.loadedPosthog()).toBeNull();
});
