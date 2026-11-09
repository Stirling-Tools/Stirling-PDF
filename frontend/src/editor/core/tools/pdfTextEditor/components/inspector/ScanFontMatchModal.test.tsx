import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScanFontMatchModal } from "@editor/tools/pdfTextEditor/components/inspector/ScanFontMatchModal";
import type { ScanFontMatch } from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";

function match(overrides: Partial<ScanFontMatch> = {}): ScanFontMatch {
  return {
    status: "ready",
    scan: null,
    choices: [{ label: "Carlito", match: 90, preview: null, active: false }],
    choose: vi.fn(),
    open: true,
    canShow: true,
    undrawable: false,
    typedFromScan: false,
    show: vi.fn(),
    close: vi.fn(),
    deviceFonts: {
      available: true,
      permission: "unsupported",
      loading: false,
      count: null,
      load: vi.fn(),
    },
    ...overrides,
  };
}

function renderModal(m: ScanFontMatch) {
  render(
    <MantineProvider env="test">
      <ScanFontMatchModal match={m} />
    </MantineProvider>,
  );
}

describe("scan font picker hint", () => {
  it("says the typing came from the scan's own letters when it did", () => {
    renderModal(match({ typedFromScan: true }));
    expect(screen.getByTestId("pdf-editor-scan-font-hint")).toHaveTextContent(
      "pdfTextEditor.scanFont.hintFromScan",
    );
  });

  it("says the typing is drawn in a font otherwise", () => {
    renderModal(match());
    expect(screen.getByTestId("pdf-editor-scan-font-hint")).toHaveTextContent(
      /^pdfTextEditor\.scanFont\.hint$/,
    );
  });

  it("says a pick also steers scanned text not yet edited", () => {
    renderModal(match());
    expect(
      screen.getByText("pdfTextEditor.scanFont.hintOthers"),
    ).toBeInTheDocument();
  });
});

describe("scan font picker device fonts prompt", () => {
  const prompting = (available: boolean) =>
    match({
      deviceFonts: {
        available,
        permission: "prompt",
        loading: false,
        count: null,
        load: vi.fn(),
      },
    });

  it("asks for device fonts when the text's script has candidates", () => {
    renderModal(prompting(true));
    expect(screen.getByTestId("pdf-editor-scan-font-device")).toBeVisible();
  });

  it("does not ask when no device font could draw the text's script", () => {
    renderModal(prompting(false));
    expect(screen.queryByTestId("pdf-editor-scan-font-device")).toBeNull();
  });

  it("does not offer device fonts when the scan is too faint to match", () => {
    renderModal({ ...prompting(true), status: "unmeasurable", choices: [] });
    expect(screen.queryByTestId("pdf-editor-scan-font-device")).toBeNull();
  });

  it("does not point at a list above when no font can draw the text", () => {
    renderModal({ ...prompting(true), status: "noFont", choices: [] });
    const card = screen.getByTestId("pdf-editor-scan-font-device");
    expect(card).toHaveTextContent("pdfTextEditor.scanFont.deviceHintNoFont");
    expect(screen.queryByText("pdfTextEditor.scanFont.deviceHint")).toBeNull();
  });
});
