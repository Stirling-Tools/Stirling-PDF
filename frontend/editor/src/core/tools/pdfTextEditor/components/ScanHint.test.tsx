import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScanHint } from "@app/tools/pdfTextEditor/components/ScanHint";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/types";

function scanPage(hasText = false): PageSnapshot {
  return {
    width: 600,
    height: 800,
    runs: hasText ? [{ id: "ocr-text" }] : [],
    images: [{ bounds: { x: 0, y: 0, width: 600, height: 800 } }],
  } as PageSnapshot;
}

describe("scan hint action", () => {
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
