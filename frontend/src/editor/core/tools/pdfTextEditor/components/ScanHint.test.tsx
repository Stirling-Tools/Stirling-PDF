import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScanHint } from "@editor/tools/pdfTextEditor/components/ScanHint";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";

function scanPage(hasText = false): PageSnapshot {
  return {
    width: 600,
    height: 800,
    runs: hasText ? [{ id: "ocr-text" }] : [],
    images: [{ bounds: { x: 0, y: 0, width: 600, height: 800 } }],
  } as PageSnapshot;
}

describe("scan hint action", () => {
  it("keeps OCR visible, explains protection, and offers Remove Password", () => {
    const onRunOcr = vi.fn();
    const onRemovePassword = vi.fn();
    const reason =
      "OCR cannot keep this PDF's password protection. Use Remove Password to create an unprotected copy first.";
    render(
      <MantineProvider env="test">
        <ScanHint
          pages={[scanPage()]}
          onRunOcr={onRunOcr}
          ocrRunning={false}
          ocrAvailable
          ocrBlockedReason={reason}
          onRemovePassword={onRemovePassword}
        />
      </MantineProvider>,
    );
    const ocr = screen.getByTestId("pdf-editor-scan-hint-ocr");
    expect(ocr).toBeVisible();
    expect(ocr).toBeDisabled();
    expect(ocr).toHaveAccessibleDescription(reason);
    expect(screen.getByRole("note")).toBeVisible();
    expect(
      screen.queryByText("pdfTextEditor.inspector.ocrUnavailable"),
    ).not.toBeInTheDocument();
    fireEvent.click(ocr);
    expect(onRunOcr).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "removePassword.submit" }),
    );
    expect(onRemovePassword).toHaveBeenCalledTimes(1);
  });

  it("runs the supplied OCR action in one click", () => {
    const onRunOcr = vi.fn();
    render(
      <MantineProvider env="test">
        <ScanHint
          pages={[scanPage()]}
          onRunOcr={onRunOcr}
          ocrRunning={false}
          ocrAvailable
        />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByTestId("pdf-editor-scan-hint-ocr"));
    expect(onRunOcr).toHaveBeenCalledTimes(1);
  });

  it.each([false, null])(
    "disables OCR when availability is %s",
    (ocrAvailable) => {
      const onRunOcr = vi.fn();
      render(
        <MantineProvider env="test">
          <ScanHint
            pages={[scanPage()]}
            onRunOcr={onRunOcr}
            ocrRunning={false}
            ocrAvailable={ocrAvailable}
          />
        </MantineProvider>,
      );
      expect(screen.getByTestId("pdf-editor-scan-hint-ocr")).toBeDisabled();
      fireEvent.click(screen.getByTestId("pdf-editor-scan-hint-ocr"));
      expect(onRunOcr).not.toHaveBeenCalled();
      expect(
        screen.queryByText("pdfTextEditor.inspector.ocrUnavailable") !== null,
      ).toBe(ocrAvailable === false);
    },
  );

  it("does not offer OCR for a page that already has text", () => {
    render(
      <MantineProvider env="test">
        <ScanHint
          pages={[scanPage(true)]}
          onRunOcr={vi.fn()}
          ocrRunning={false}
          ocrAvailable
        />
      </MantineProvider>,
    );
    expect(
      screen.queryByTestId("pdf-editor-scan-hint"),
    ).not.toBeInTheDocument();
  });
});

function outlinedPage(letters: number, height = 3): PageSnapshot {
  return {
    width: 612,
    height: 792,
    runs: [],
    images: [{ bounds: { x: 40, y: 700, width: 80, height: 40 } }],
    shapes: Array.from({ length: letters }, (_, i) => ({
      bounds: {
        x: 40 + (i % 90) * 6,
        y: 600 - Math.floor(i / 90) * 12,
        width: 4,
        height,
      },
    })),
  } as unknown as PageSnapshot;
}

describe("pages whose text is drawn as shapes", () => {
  const renderHint = (pages: PageSnapshot[]) =>
    render(
      <MantineProvider env="test">
        <ScanHint
          pages={pages}
          onRunOcr={vi.fn()}
          ocrRunning={false}
          ocrAvailable
        />
      </MantineProvider>,
    );

  it("offers OCR for a page of letter-sized outlines with no text", () => {
    renderHint([outlinedPage(1600)]);
    expect(screen.getByTestId("pdf-editor-scan-hint-ocr")).toBeEnabled();
  });

  it("does not call shape-drawn pages scanned images when both kinds are present", () => {
    renderHint([scanPage(), outlinedPage(1600)]);
    const hint = screen.getByTestId("pdf-editor-scan-hint");
    expect(hint).toHaveTextContent("unreadPagesHint");
    expect(hint).not.toHaveTextContent("scanHint");
  });

  it("does not offer OCR for a page with a few drawn shapes", () => {
    renderHint([outlinedPage(20)]);
    expect(
      screen.queryByTestId("pdf-editor-scan-hint"),
    ).not.toBeInTheDocument();
  });

  it("does not offer OCR when the page has text", () => {
    renderHint([
      { ...outlinedPage(1600), runs: [{ id: "r" }] } as PageSnapshot,
    ]);
    expect(
      screen.queryByTestId("pdf-editor-scan-hint"),
    ).not.toBeInTheDocument();
  });
});
