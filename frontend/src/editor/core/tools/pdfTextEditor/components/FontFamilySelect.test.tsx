import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, alert } = vi.hoisted(() => ({ get: vi.fn(), alert: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));
vi.mock("@editor/components/toast", () => ({ alert }));

import { FontFamilySelect } from "@editor/tools/pdfTextEditor/components/FontFamilySelect";
import type { FontPickFailure } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import {
  SERVER_FONTS_URL,
  forgetServerFontList,
} from "@editor/tools/pdfTextEditor/util/serverFonts";

const MANIFEST = {
  families: [
    {
      family: "Acme Sans",
      faces: [
        {
          id: "1".repeat(64),
          style: "Regular",
          bold: false,
          italic: false,
          weight: 400,
          postscriptName: "AcmeSans-Regular",
          format: "ttf",
          size: 4,
        },
        {
          id: "2".repeat(64),
          style: "Bold",
          bold: true,
          italic: false,
          weight: 700,
          postscriptName: "AcmeSans-Bold",
          format: "ttf",
          size: 4,
        },
      ],
    },
  ],
};

function renderPicker(
  onChange: (family: string) => Promise<FontPickFailure | null>,
) {
  render(
    <MantineProvider env="test">
      <FontFamilySelect value="Helvetica" onChange={onChange} />
    </MantineProvider>,
  );
  return screen.getByTestId("pdf-editor-font-family");
}

describe("font picker server fonts", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    get.mockReset();
    alert.mockReset();
    forgetServerFontList();
    get.mockImplementation(async (url: string) => {
      if (url === SERVER_FONTS_URL) return { data: MANIFEST };
      throw new Error(`unexpected ${url}`);
    });
  });

  it("asks the server for its font list only when the picker opens", async () => {
    const input = renderPicker(async () => null);
    expect(get).not.toHaveBeenCalled();

    fireEvent.click(input);

    expect(await screen.findByText("Acme Sans")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(SERVER_FONTS_URL, expect.anything());
  });

  it("offers the bold cut of a server family that has one", async () => {
    const onChange = vi.fn(async () => null);
    const input = renderPicker(onChange);

    fireEvent.click(input);
    fireEvent.click(await screen.findByText("Acme Sans Bold"));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("Acme Sans Bold"),
    );
  });

  it("reports a server font that could not be applied", async () => {
    const onChange = vi.fn(
      async (): Promise<FontPickFailure> => "serverFontFailed",
    );
    const input = renderPicker(onChange);

    fireEvent.click(input);
    fireEvent.click(await screen.findByText("Acme Sans"));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Acme Sans"));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith({
        alertType: "warning",
        expandable: false,
        title: "pdfTextEditor.fontPicker.serverFontFailed",
      }),
    );
    expect(
      screen.queryByTestId("pdf-editor-device-fonts-notice"),
    ).not.toBeInTheDocument();
  });

  it("reports a font with no characters for the selected text", async () => {
    const onChange = vi.fn(async (): Promise<FontPickFailure> => "noGlyphs");
    const input = renderPicker(onChange);

    fireEvent.click(input);
    fireEvent.click(await screen.findByText("Acme Sans Bold"));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith({
        alertType: "warning",
        expandable: false,
        title: "pdfTextEditor.fontPicker.noGlyphs",
      }),
    );
  });

  it("raises nothing when the font applies", async () => {
    const onChange = vi.fn(async () => null);
    const input = renderPicker(onChange);

    fireEvent.click(input);
    fireEvent.click(await screen.findByText("Acme Sans"));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Acme Sans"));
    expect(alert).not.toHaveBeenCalled();
  });

  it("names the font a scan was matched to, not a document font", async () => {
    render(
      <MantineProvider env="test">
        <FontFamilySelect
          value="Carlito"
          scanned={{ label: "Calibri (Carlito)" }}
          onChange={async () => null}
        />
      </MantineProvider>,
    );
    const input = screen.getByTestId("pdf-editor-font-family");
    expect(input).toHaveValue("Calibri (Carlito)");

    fireEvent.click(input);

    expect(
      await screen.findByText("pdfTextEditor.fontPicker.matchedGroup"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("pdfTextEditor.fontPicker.documentGroup"),
    ).not.toBeInTheDocument();
  });

  it("says scanned text when no font is in force for it", () => {
    render(
      <MantineProvider env="test">
        <FontFamilySelect
          value={null}
          scanned={{}}
          onChange={async () => null}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId("pdf-editor-font-family")).toHaveAttribute(
      "placeholder",
      "pdfTextEditor.fontPicker.scannedText",
    );
  });
});
