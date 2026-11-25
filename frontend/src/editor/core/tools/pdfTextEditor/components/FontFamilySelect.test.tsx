import { useState } from "react";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, alert } = vi.hoisted(() => ({ get: vi.fn(), alert: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));
vi.mock("@editor/components/toast", () => ({ alert }));

import { FontFamilySelect } from "@editor/tools/pdfTextEditor/components/FontFamilySelect";
import type { FontPickFailure } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import {
  SERVER_FONTS_URL,
  forgetServerFontList,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import { resetLocalFontsCache } from "@editor/tools/pdfTextEditor/util/localFonts";
import { documentFamilies } from "@editor/tools/pdfTextEditor/util/fontFaces";

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

  it("lists a server family once, leaving its bold face to the Bold toggle", async () => {
    const onChange = vi.fn(async () => null);
    const input = renderPicker(onChange);

    fireEvent.click(input);
    fireEvent.click(await screen.findByText("Acme Sans"));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Acme Sans"));
    expect(screen.queryByText("Acme Sans Bold")).not.toBeInTheDocument();
  });

  it("lists each built-in family once", async () => {
    const input = renderPicker(async () => null);

    fireEvent.click(input);
    await screen.findByText("Acme Sans");

    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Helvetica", "Times", "Courier", "Acme Sans"]);
  });

  it("lists a family that has only a bold face under its family name", async () => {
    get.mockImplementation(async (url: string) => {
      if (url !== SERVER_FONTS_URL) throw new Error(`unexpected ${url}`);
      return {
        data: {
          families: [
            {
              family: "Acme Display Bold",
              faces: [{ ...MANIFEST.families[0].faces[0], id: "3".repeat(64) }],
            },
          ],
        },
      };
    });
    const onChange = vi.fn(async () => null);
    const input = renderPicker(onChange);

    fireEvent.click(input);
    fireEvent.click(await screen.findByText("Acme Display"));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("Acme Display Bold"),
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
    fireEvent.click(await screen.findByText("Acme Sans"));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith({
        alertType: "warning",
        expandable: false,
        title: "pdfTextEditor.fontPicker.noGlyphs",
      }),
    );
  });

  it("lists a family named like another family's bold cut once", async () => {
    get.mockImplementation(async (url: string) => {
      if (url !== SERVER_FONTS_URL) throw new Error(`unexpected ${url}`);
      return {
        data: {
          families: [
            ...MANIFEST.families,
            {
              family: "Acme Sans Bold",
              faces: [{ ...MANIFEST.families[0].faces[0], id: "3".repeat(64) }],
            },
          ],
        },
      };
    });
    const input = renderPicker(async () => null);

    fireEvent.click(input);

    expect(await screen.findAllByText("Acme Sans")).toHaveLength(1);
    expect(screen.queryByText("Acme Sans Bold")).not.toBeInTheDocument();
  });

  it("raises nothing when the font applies", async () => {
    const onChange = vi.fn(async () => null);
    const input = renderPicker(onChange);

    fireEvent.click(input);
    fireEvent.click(await screen.findByText("Acme Sans"));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Acme Sans"));
    expect(alert).not.toHaveBeenCalled();
  });

  it.each<FontPickFailure>([
    "serverFontFailed",
    "embedFailed",
    "noGlyphs",
    "missingGlyphs",
  ])("names the text's own font again after a %s refusal", async (failure) => {
    const onChange = vi.fn(async (): Promise<FontPickFailure> => failure);
    const input = renderPicker(onChange);

    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "Acme" } });
    fireEvent.click(await screen.findByText("Acme Sans"));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).toHaveValue("Helvetica");
  });

  it("names the picked font once the text takes it", async () => {
    function Controlled() {
      const [value, setValue] = useState("Helvetica");
      return (
        <MantineProvider env="test">
          <FontFamilySelect
            value={value}
            onChange={async (family) => {
              setValue(family);
              return null;
            }}
          />
        </MantineProvider>
      );
    }
    render(<Controlled />);
    const input = screen.getByTestId("pdf-editor-font-family");

    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "Acme" } });
    fireEvent.click(await screen.findByText("Acme Sans"));

    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).toHaveValue("Acme Sans");
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

describe("font picker device fonts", () => {
  beforeEach(() => {
    resetLocalFontsCache();
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "permissions");
    delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
  });

  it("lists the device fonts from the button after the automatic listing failed", async () => {
    const queryLocalFonts = vi
      .fn()
      .mockRejectedValueOnce(new Error("busy"))
      .mockResolvedValue([
        { family: "Acme Serif", style: "Regular", postscriptName: "AcmeSerif" },
      ]);
    (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts =
      queryLocalFonts;
    renderPicker(async () => null);
    await waitFor(() => expect(queryLocalFonts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("pdf-editor-use-device-fonts"));

    await waitFor(() => expect(queryLocalFonts).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByTestId("pdf-editor-use-device-fonts"),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("pdf-editor-device-fonts-notice"),
    ).not.toBeInTheDocument();
  });
});

describe("font picker document font", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("offers the PDF's own font again once the text was changed away from it", async () => {
    const onChange = vi.fn();
    render(
      <MantineProvider env="test">
        <FontFamilySelect
          value="Helvetica"
          documentFontId="pdf:7:Garamond"
          onChange={onChange}
        />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByTestId("pdf-editor-font-family"));
    fireEvent.click(await screen.findByText("Garamond"));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("pdf:7:Garamond"),
    );
  });

  it("lists the document's faces of the text's own family once", async () => {
    render(
      <MantineProvider env="test">
        <FontFamilySelect
          value="Calibri"
          fontId="pdf:2:Calibri-Bold"
          documentFamilies={documentFamilies([
            "pdf:1:Calibri",
            "pdf:2:Calibri-Bold",
            "pdf:3:Calibri-Italic",
          ])}
          onChange={vi.fn()}
        />
      </MantineProvider>,
    );
    const input = screen.getByTestId("pdf-editor-font-family");
    expect(input).toHaveValue("Calibri");

    fireEvent.click(input);

    expect(
      await screen.findAllByRole("option", { name: "Calibri" }),
    ).toHaveLength(1);
  });
});
