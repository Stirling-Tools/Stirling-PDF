import { describe, expect, it, vi } from "vitest";
import { matchableSample } from "@editor/tools/pdfTextEditor/util/matchableSample";
import { captureScanEdit } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { scanFrameFor } from "@editor/tools/pdfTextEditor/commands/scanFrame";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

vi.mock("@editor/tools/pdfTextEditor/commands/scanTextEdit", async () => {
  const { scanFrameFor } =
    await import("@editor/tools/pdfTextEditor/commands/scanFrame");
  return {
    isScanRun: () => false,
    captureScanEdit: vi.fn(
      (_m: unknown, run: { matrix: never; bounds: never }, page: never) => ({
        frame: scanFrameFor(page, run.matrix, run.bounds),
      }),
    ),
  };
});

const UPRIGHT = { a: 10, b: 0, c: 0, d: 10, e: 0, f: 0 };
const TURNED = { a: 0, b: 10, c: -10, d: 0, e: 0, f: 0 };

function run(id: string, text: string, matrix: typeof UPRIGHT) {
  return {
    id,
    fontId: "F1",
    text,
    matrix,
    bounds: { x: 10, y: 10, width: 100, height: 12 },
  };
}

describe("matchableSample", () => {
  it("finds an upright run behind more turned runs than it captures", () => {
    const page = {
      display: {
        cropLeft: 0,
        cropBottom: 0,
        cropWidth: 600,
        cropHeight: 800,
      },
      runs: [
        ...Array.from({ length: 5 }, (_, i) =>
          run(`t${i}`, "Turned margin label text", TURNED),
        ),
        run("u", "Invoice total", UPRIGHT),
      ],
    };
    const doc = {
      module: {},
      loadedPages: () => [page],
    } as unknown as EditorDocument;
    expect(scanFrameFor(page as never, TURNED, page.runs[0].bounds)).not.toBe(
      null,
    );

    expect(matchableSample(doc, "F1")?.text).toBe("Invoice total");
    expect(captureScanEdit).toHaveBeenCalledTimes(1);
  });
});
