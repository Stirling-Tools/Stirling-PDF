import { describe, expect, it, vi } from "vitest";

const { prefitScanRun } = vi.hoisted(() => ({ prefitScanRun: vi.fn() }));
vi.mock("@editor/tools/pdfTextEditor/commands/scanTextEdit", () => ({
  prefitScanRun,
  scanRunNeedsFit: () => true,
}));

import { prefitInSlices } from "@editor/tools/pdfTextEditor/commands/scanFitSlices";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";

describe("prefitInSlices", () => {
  it("stops fitting once the document is closed between slices", async () => {
    const doc = { disposed: false };
    prefitScanRun.mockReturnValue(true).mockImplementationOnce(() => {
      doc.disposed = true;
      return false;
    });
    const target = { page: {} as Page, run: {} as TextRun };

    await prefitInSlices(doc as unknown as EditorDocument, [target, target]);

    expect(prefitScanRun).toHaveBeenCalledTimes(1);
  });
});
