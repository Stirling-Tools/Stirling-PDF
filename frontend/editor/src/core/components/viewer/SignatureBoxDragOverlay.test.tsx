import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import SignatureBoxDragOverlay from "@app/components/viewer/SignatureBoxDragOverlay";
import { showSignaturePlacement } from "@app/constants/signaturePlacementEvents";

// A page of 600 x 800 pt, drawn at half size so CSS pixels are half the points.
vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: {
    createDocument: vi.fn().mockResolvedValue({
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 600, height: 800 }),
      }),
    }),
    destroyDocument: vi.fn(),
  },
}));

const pdf = new Blob(["%PDF-1.7"], { type: "application/pdf" });

function overlay(pageIndex: number) {
  return render(
    <SignatureBoxDragOverlay
      pageIndex={pageIndex}
      pageWidth={300}
      pageHeight={400}
      pdfSource={pdf}
    />,
  );
}

const placed = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-signature-placed-box]");

describe("SignatureBoxDragOverlay placed box", () => {
  afterEach(() => act(() => showSignaturePlacement(null)));

  it("keeps the drawn box on its page, in the page's own position", async () => {
    act(() =>
      showSignaturePlacement({
        pageNumber: 1,
        area: { x: 100, y: 200, width: 200, height: 100 },
      }),
    );
    const { container } = overlay(0);

    await waitFor(() => expect(placed(container)).not.toBeNull());
    // PDF y runs up from the bottom: the box's top edge is 800 - 300 = 500 pt down.
    expect(placed(container)!.style).toMatchObject({
      left: "50px",
      top: "250px",
      width: "100px",
      height: "50px",
    });
  });

  it("shows nothing on the other pages", async () => {
    act(() =>
      showSignaturePlacement({
        pageNumber: 2,
        area: { x: 100, y: 200, width: 200, height: 100 },
      }),
    );
    const { container } = overlay(0);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(placed(container)).toBeNull();
  });

  it("takes the box away when the tool clears it", async () => {
    const { container } = overlay(0);
    act(() =>
      showSignaturePlacement({
        pageNumber: 1,
        area: { x: 100, y: 200, width: 200, height: 100 },
      }),
    );
    await waitFor(() => expect(placed(container)).not.toBeNull());

    act(() => showSignaturePlacement(null));

    expect(placed(container)).toBeNull();
  });
});
