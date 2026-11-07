import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import { FontFamilySelect } from "@editor/tools/pdfTextEditor/components/FontFamilySelect";
import type { FontPickFailure } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import {
  SERVER_FONTS_URL,
  resetServerFontsCache,
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
    resetServerFontsCache();
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
    expect(
      await screen.findByText("pdfTextEditor.fontPicker.serverFontFailed"),
    ).toBeInTheDocument();
  });
});
