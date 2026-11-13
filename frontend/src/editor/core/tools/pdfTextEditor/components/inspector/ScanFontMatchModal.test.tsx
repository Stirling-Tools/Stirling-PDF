import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ScanFontMatchModal,
  ScanFontMatchRow,
} from "@editor/tools/pdfTextEditor/components/inspector/ScanFontMatchModal";
import type {
  ScanFontChoice,
  ScanFontMatch,
} from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";

function match(overrides: Partial<ScanFontMatch> = {}): ScanFontMatch {
  return {
    status: "ready",
    scan: null,
    choices: [
      {
        label: "Carlito",
        match: 90,
        preview: null,
        active: false,
        approximate: false,
      },
    ],
    choose: vi.fn(),
    open: true,
    canShow: true,
    approximate: false,
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

  it("asks with one generic button whether or not a font can draw the text", () => {
    for (const status of ["ready", "noFont"] as const) {
      const { unmount } = render(
        <MantineProvider env="test">
          <ScanFontMatchModal match={{ ...prompting(true), status }} />
        </MantineProvider>,
      );
      expect(
        screen.getByTestId("pdf-editor-scan-font-device-allow"),
      ).toHaveTextContent("pdfTextEditor.scanFont.deviceAllow");
      expect(
        screen.getByTestId("pdf-editor-scan-font-device").textContent,
      ).toBe(
        "pdfTextEditor.scanFont.deviceAllowpdfTextEditor.scanFont.deviceNote",
      );
      unmount();
    }
  });
});

describe("approximate scan font matches", () => {
  const choice = (overrides: Partial<ScanFontChoice>): ScanFontChoice => ({
    label: "Carlito",
    match: 70,
    preview: null,
    active: true,
    approximate: false,
    ...overrides,
  });

  it("marks an applied weak match instead of ticking it", () => {
    renderModal(
      match({
        approximate: true,
        choices: [
          choice({ label: "Carlito", approximate: true }),
          choice({ label: "Caladea", active: false, approximate: true }),
        ],
      }),
    );
    const [applied, other] = screen.getAllByTestId(
      "pdf-editor-scan-font-choice",
    );
    expect(applied).toHaveAttribute("aria-pressed", "true");
    expect(applied).toHaveAttribute("data-approximate", "true");
    expect(applied).toHaveTextContent("pdfTextEditor.scanFont.approximate");
    expect(other).not.toHaveAttribute("data-approximate");
    expect(
      screen.getAllByTestId("pdf-editor-scan-font-choice-approximate"),
    ).toHaveLength(1);
  });

  it("ticks a strong match without the approximate label", () => {
    renderModal(
      match({ choices: [choice({ match: 95, approximate: false })] }),
    );
    const [applied] = screen.getAllByTestId("pdf-editor-scan-font-choice");
    expect(applied).not.toHaveAttribute("data-approximate");
    expect(
      screen.queryByTestId("pdf-editor-scan-font-choice-approximate"),
    ).toBeNull();
  });

  it("points the inspector at the picker when the match is approximate", () => {
    const m = match({ open: false, approximate: true });
    render(
      <MantineProvider env="test">
        <ScanFontMatchRow match={m} />
      </MantineProvider>,
    );
    expect(
      screen.getByTestId("pdf-editor-scan-font-approximate"),
    ).toHaveTextContent("pdfTextEditor.scanFont.approximate");
    fireEvent.click(screen.getByTestId("pdf-editor-scan-font-open"));
    expect(m.show).toHaveBeenCalled();
  });

  it("keeps the quiet row for a strong match", () => {
    render(
      <MantineProvider env="test">
        <ScanFontMatchRow match={match({ open: false })} />
      </MantineProvider>,
    );
    expect(screen.queryByTestId("pdf-editor-scan-font-approximate")).toBeNull();
    expect(screen.getByTestId("pdf-editor-scan-font-open")).toHaveTextContent(
      "pdfTextEditor.scanFont.change",
    );
  });
});
