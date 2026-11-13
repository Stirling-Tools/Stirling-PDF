import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  fontCanBeCompleted,
  fontCompletionFor,
  fontNameRefused,
  resetFontCompletions,
  resolveOriginalFonts,
  setClosestFont,
} from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import { resetFontHelperCaches } from "@editor/tools/pdfTextEditor/charcode/FontHelpers";
import { fallbackFamilyFor } from "@editor/tools/pdfTextEditor/util/fontCapability";
import { embeddedFontProgram } from "@editor/tools/pdfTextEditor/util/embeddedFace";
import { getExternalFontBytes } from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  listLocalFonts,
  registerFontBytes,
  resetLocalFontsCache,
  type LocalFont,
} from "@editor/tools/pdfTextEditor/util/localFonts";

vi.mock("@editor/tools/pdfTextEditor/util/embeddedFace", () => ({
  embeddedFontProgram: vi.fn(() => null),
}));

const FONTS = path.join(
  import.meta.dirname,
  "../../../../../../../app/core/src/main/resources/static/fonts",
);
const fontFile = async (name: string) =>
  new Uint8Array(await readFile(path.join(FONTS, name)));

interface Installed extends LocalFont {
  file: string;
}

const face = (
  family: string,
  style: string,
  postscriptName: string,
  file: string,
): Installed => ({
  family,
  fullName: style === "Regular" ? family : `${family} ${style}`,
  style,
  postscriptName,
  file,
});

async function install(fonts: Installed[]): Promise<void> {
  const files = new Map<string, Uint8Array>();
  for (const font of fonts) files.set(font.file, await fontFile(font.file));
  (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts = vi.fn(
    async () =>
      fonts.map((font) => ({
        ...font,
        blob: async () => ({
          arrayBuffer: async () => files.get(font.file)!.slice().buffer,
        }),
      })),
  );
  await listLocalFonts();
}

// A document font whose /BaseFont reads `baseFont`.
function documentNaming(baseFont: string): WrappedPdfiumModule {
  return {
    FPDFFont_GetBaseFontName: () => baseFont.length + 1,
    pdfium: {
      wasmExports: { malloc: () => 8, free: () => undefined },
      UTF8ToString: () => baseFont,
    },
  } as unknown as WrappedPdfiumModule;
}

const stillOpen = () => true;

beforeEach(() => {
  resetLocalFontsCache();
  resetFontCompletions();
  resetFontHelperCaches();
  vi.mocked(embeddedFontProgram).mockReturnValue(null);
  delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
});

describe("resolveOriginalFonts", () => {
  it("completes a subset from the installed font its glyphs agree with", async () => {
    await install([
      face(
        "Liberation Sans",
        "Regular",
        "LiberationSans",
        "LiberationSans-Regular.ttf",
      ),
    ]);
    vi.mocked(embeddedFontProgram).mockReturnValue(
      await fontFile("LiberationSans-Regular.ttf"),
    );
    const id = "pdf:11:Liberation Sans";

    await resolveOriginalFonts(
      documentNaming("ABCDEF+LiberationSans"),
      [id],
      stillOpen,
    );

    expect(fontCompletionFor(id)).toEqual({
      family: "Liberation Sans",
      source: "original",
    });
    expect(fallbackFamilyFor(id)).toBe("Liberation Sans");
  });

  it("refuses an installed font that only shares the name", async () => {
    await install([
      face("Liberation Sans", "Regular", "LiberationSans", "DejaVuSans.ttf"),
    ]);
    vi.mocked(embeddedFontProgram).mockReturnValue(
      await fontFile("LiberationSans-Regular.ttf"),
    );
    const id = "pdf:12:Liberation Sans";

    await resolveOriginalFonts(
      documentNaming("ABCDEF+LiberationSans"),
      [id],
      stillOpen,
    );

    expect(fontCompletionFor(id)).toBeNull();
    expect(fontNameRefused(id)).toBe(true);
    expect(fallbackFamilyFor(id)).toBe("Helvetica");
  });

  it("finds the cut the PostScript name asks for, not the family's regular", async () => {
    await install([
      face(
        "Liberation Sans",
        "Regular",
        "LiberationSans",
        "LiberationSans-Regular.ttf",
      ),
      face(
        "Liberation Sans",
        "Bold",
        "LiberationSans-Bold",
        "LiberationSans-Bold.ttf",
      ),
    ]);
    vi.mocked(embeddedFontProgram).mockReturnValue(
      await fontFile("LiberationSans-Bold.ttf"),
    );
    const id = "pdf:13:Liberation Sans";

    await resolveOriginalFonts(
      documentNaming("EAAAAA+LiberationSans-Bold"),
      [id],
      stillOpen,
    );

    expect(fontCompletionFor(id)).toEqual({
      family: "Liberation Sans Bold",
      source: "original",
    });
  });

  it("finds a cut no bold or italic flag can name, and draws with that cut", async () => {
    await install([
      face(
        "Liberation Sans",
        "Regular",
        "LiberationSans",
        "LiberationSans-Regular.ttf",
      ),
      face(
        "Liberation Sans",
        "Light",
        "LiberationSans-Light",
        "DejaVuSans.ttf",
      ),
    ]);
    const light = await fontFile("DejaVuSans.ttf");
    vi.mocked(embeddedFontProgram).mockReturnValue(light);
    const id = "pdf:18:Liberation Sans";

    await resolveOriginalFonts(
      documentNaming("EAAAAA+LiberationSans-Light"),
      [id],
      stillOpen,
    );

    const completion = fontCompletionFor(id);
    expect(completion?.source).toBe("original");
    expect(getExternalFontBytes(completion!.family)).toEqual(light);
    expect(fontNameRefused(id)).toBe(false);
  });

  it("trusts the name when the embedded font cannot be read", async () => {
    await install([
      face(
        "Liberation Sans",
        "Regular",
        "LiberationSans",
        "LiberationSans-Regular.ttf",
      ),
    ]);
    const id = "pdf:14:Liberation Sans";

    await resolveOriginalFonts(
      documentNaming("LiberationSans"),
      [id],
      stillOpen,
    );

    expect(fontCompletionFor(id)?.source).toBe("original");
  });

  it("leaves a font nobody has installed without a completion", async () => {
    await install([
      face(
        "Liberation Sans",
        "Regular",
        "LiberationSans",
        "LiberationSans-Regular.ttf",
      ),
    ]);
    const id = "pdf:15:Frobnicate";

    await resolveOriginalFonts(
      documentNaming("QWERTY+Frobnicate"),
      [id],
      stillOpen,
    );

    expect(fontCompletionFor(id)).toBeNull();
    expect(fontNameRefused(id)).toBe(false);
    expect(fallbackFamilyFor(id)).toBe("Helvetica");
  });

  it("records nothing once the document has been closed", async () => {
    await install([
      face(
        "Liberation Sans",
        "Regular",
        "LiberationSans",
        "LiberationSans-Regular.ttf",
      ),
    ]);
    const id = "pdf:16:Liberation Sans";

    await resolveOriginalFonts(
      documentNaming("LiberationSans"),
      [id],
      () => false,
    );

    expect(fontCompletionFor(id)).toBeNull();
  });

  it("does nothing before any font list has loaded", async () => {
    const id = "pdf:17:Liberation Sans";
    await resolveOriginalFonts(
      documentNaming("LiberationSans"),
      [id],
      stillOpen,
    );
    expect(fontCompletionFor(id)).toBeNull();
  });
});

describe("fontCanBeCompleted", () => {
  it("leaves alone a standard font the file only names", () => {
    // PDFium draws a non-embedded Helvetica in a stand-in face whose family name is all the font id carries.
    expect(
      fontCanBeCompleted(documentNaming("Helvetica"), "pdf:31:Chrom Sans OTF"),
    ).toBe(false);
    expect(
      fontCanBeCompleted(
        documentNaming("Times-Bold"),
        "pdf:32:Chrom Serif OTF",
      ),
    ).toBe(false);
  });

  it("takes an embedded subset, tagged or not", () => {
    expect(
      fontCanBeCompleted(documentNaming("ABCDEF+Georgia"), "pdf:33:Georgia"),
    ).toBe(true);
    expect(fontCanBeCompleted(documentNaming("ArialMT"), "pdf:34:Arial")).toBe(
      true,
    );
  });

  it("is never true for a font that is not the document's own", () => {
    expect(
      fontCanBeCompleted(documentNaming("Georgia"), "device:Georgia"),
    ).toBe(false);
    expect(
      fontCanBeCompleted(documentNaming("Helvetica"), "base14:Helvetica"),
    ).toBe(false);
  });
});

describe("the closest font", () => {
  it("stands in until the original turns up, and never replaces it", async () => {
    const id = "pdf:21:Liberation Sans";
    registerFontBytes("DejaVu Sans", await fontFile("DejaVuSans.ttf"));

    setClosestFont(id, "DejaVu Sans");
    expect(fontCompletionFor(id)).toEqual({
      family: "DejaVu Sans",
      source: "closest",
    });
    expect(fallbackFamilyFor(id)).toBe("DejaVu Sans");

    await install([
      face(
        "Liberation Sans",
        "Regular",
        "LiberationSans",
        "LiberationSans-Regular.ttf",
      ),
    ]);
    await resolveOriginalFonts(
      documentNaming("LiberationSans"),
      [id],
      stillOpen,
    );
    setClosestFont(id, "DejaVu Sans");

    expect(fontCompletionFor(id)?.source).toBe("original");
  });

  it("is ignored while its font cannot be drawn", () => {
    setClosestFont("pdf:22:Whatever", "A Font With No Bytes");
    expect(fontCompletionFor("pdf:22:Whatever")).toBeNull();
    expect(fallbackFamilyFor("pdf:22:Whatever")).toBe("Helvetica");
  });

  it("is forgotten with the document", () => {
    setClosestFont("pdf:23:Whatever", "Times-Roman");
    expect(fontCompletionFor("pdf:23:Whatever")?.family).toBe("Times-Roman");
    resetFontCompletions();
    expect(fontCompletionFor("pdf:23:Whatever")).toBeNull();
  });
});
