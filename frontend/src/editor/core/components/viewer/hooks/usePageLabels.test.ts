import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@editor/services/documentBytesCache", () => ({
  getDocumentBytes: vi.fn(async () => new ArrayBuffer(8)),
}));
vi.mock("@editor/services/pdfiumService", () => ({ getPageLabels: vi.fn() }));
vi.mock("@editor/services/pdfiumScanQueue", () => ({
  runPdfiumScan: (scan: () => unknown) => scan(),
}));

import { getPageLabels } from "@editor/services/pdfiumService";
import { usePageLabels } from "@editor/components/viewer/hooks/usePageLabels";

const makeFile = () =>
  new File([new Uint8Array([1])], "labelled.pdf", { type: "application/pdf" });

describe("usePageLabels", () => {
  it("drops the previous labels while a replacement document is not ready", async () => {
    vi.mocked(getPageLabels).mockResolvedValue(["i", "ii"]);
    const file = makeFile();
    const { result, rerender } = renderHook(
      ({ documentKey, enabled }: { documentKey: string; enabled: boolean }) =>
        usePageLabels(file, documentKey, enabled),
      { initialProps: { documentKey: "document-one", enabled: true } },
    );
    await waitFor(() => expect(result.current).toEqual(["i", "ii"]));

    rerender({ documentKey: "document-two", enabled: false });

    expect(result.current).toBeNull();
    expect(getPageLabels).toHaveBeenCalledTimes(1);
  });
});
