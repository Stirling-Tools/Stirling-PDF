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

function pdf(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

describe("analytics", () => {
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
