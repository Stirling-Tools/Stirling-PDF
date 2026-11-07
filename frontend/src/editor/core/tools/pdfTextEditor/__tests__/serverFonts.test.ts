import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import {
  SERVER_FONTS_URL,
  forgetServerFontList,
  getServerFontBytes,
  loadServerFontBytes,
  loadServerFonts,
  loadedServerFonts,
  resetServerFontsCache,
  serverFaceFor,
  serverFontCssFamily,
  subscribeServerFonts,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import {
  getExternalFontBytes,
  loadedExternalFonts,
} from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  listLocalFonts,
  pickLocalFontFace,
  resetLocalFontsCache,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import { deviceFontIdFor } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  italicCapability,
  resetDocumentFontMatchCache,
} from "@editor/tools/pdfTextEditor/util/fontCapability";

const requestsAtImport = get.mock.calls.length;

const REGULAR = "1".repeat(64);
const ITALIC = "2".repeat(64);
const BOLD = "3".repeat(64);

const MANIFEST = {
  families: [
    {
      family: "Acme Sans",
      faces: [
        face(REGULAR, "Regular", false, false),
        face(ITALIC, "Italic", false, true),
        face(BOLD, "Bold", true, false),
        { id: "../../etc/passwd", style: "Evil" },
      ],
    },
    { family: "", faces: [face("4".repeat(64), "Regular", false, false)] },
  ],
};

function face(id: string, style: string, bold: boolean, italic: boolean) {
  return {
    id,
    style,
    bold,
    italic,
    weight: bold ? 700 : 400,
    postscriptName: `AcmeSans-${style}`,
    format: "ttf",
    size: 4,
  };
}

function bytesFor(id: string): ArrayBuffer {
  return new Uint8Array([Number(id[0]), 0, 0, 1]).buffer;
}

function serveManifestAndFaces(): void {
  get.mockImplementation(async (url: string) => {
    if (url === SERVER_FONTS_URL) return { data: MANIFEST };
    const id = url.slice(SERVER_FONTS_URL.length + 1);
    return { data: bytesFor(id) };
  });
}

function faceRequests(): string[] {
  return get.mock.calls
    .map(([url]) => url as string)
    .filter((url) => url !== SERVER_FONTS_URL);
}

describe("server fonts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as unknown as { fonts?: unknown }).fonts;
  });

  beforeEach(() => {
    get.mockReset();
    resetServerFontsCache();
    resetLocalFontsCache();
    resetDocumentFontMatchCache();
    delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
  });

  it("fetches nothing until asked", () => {
    expect(requestsAtImport).toBe(0);
    expect(loadedServerFonts()).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("loads the manifest once and keeps only well-formed faces", async () => {
    serveManifestAndFaces();

    const [first, second] = await Promise.all([
      loadServerFonts(),
      loadServerFonts(),
    ]);
    await loadServerFonts();

    expect(get).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first?.map((font) => font.style)).toEqual([
      "Regular",
      "Italic",
      "Bold",
    ]);
    expect(serverFaceFor("acme-sans")?.id).toBe(REGULAR);
    expect(serverFaceFor("Other")).toBeNull();
  });

  it("retries the manifest after a failed fetch", async () => {
    get.mockRejectedValueOnce(new Error("offline"));
    expect(await loadServerFonts()).toBeNull();

    serveManifestAndFaces();
    expect(await loadServerFonts()).toHaveLength(3);
  });

  it("asks again after the server answered with no fonts", async () => {
    get.mockResolvedValueOnce({ data: { families: [] } });
    expect(await loadServerFonts()).toBeNull();
    expect(loadedServerFonts()).toBeNull();

    serveManifestAndFaces();
    expect(await loadServerFonts()).toHaveLength(3);
  });

  it("forgets the list when the backend changes, ignoring the old answer", async () => {
    let answerOldServer: (value: { data: unknown }) => void = () => {};
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerOldServer = resolve;
        }),
    );
    const fromOldServer = loadServerFonts();
    const listener = vi.fn();
    const unsubscribe = subscribeServerFonts(listener);

    forgetServerFontList();
    expect(listener).toHaveBeenCalledTimes(1);
    get.mockResolvedValueOnce({
      data: {
        families: [
          {
            family: "Beta Serif",
            faces: [face("5".repeat(64), "Regular", false, false)],
          },
        ],
      },
    });
    const fromNewServer = await loadServerFonts();
    answerOldServer({ data: MANIFEST });

    expect(await fromOldServer).toBeNull();
    expect(fromNewServer?.map((font) => font.family)).toEqual(["Beta Serif"]);
    expect(loadedServerFonts()).toBe(fromNewServer);
    unsubscribe();
  });

  it("registers a downloaded face under its own alias, not the family name", async () => {
    const families: string[] = [];
    vi.stubGlobal(
      "FontFace",
      class {
        constructor(family: string) {
          families.push(family);
        }
        load() {
          return Promise.resolve(this);
        }
      },
    );
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { add: vi.fn() },
    });
    serveManifestAndFaces();
    await loadServerFonts();

    expect(serverFontCssFamily("Acme Sans")).toBeNull();
    await loadServerFontBytes("Acme Sans");

    expect(families).toEqual([`serverface-${REGULAR}`]);
    expect(serverFontCssFamily("acme-sans")).toBe(`serverface-${REGULAR}`);
  });

  it("embeds one face once whichever spelling asked for it", async () => {
    serveManifestAndFaces();
    await loadServerFonts();

    await loadServerFontBytes("Acme Sans");
    await loadServerFontBytes("Acme Sans Regular");
    await loadServerFontBytes("Acme Sans Italic");

    expect(deviceFontIdFor("Acme Sans Regular")).toBe(
      deviceFontIdFor("Acme Sans"),
    );
    expect(deviceFontIdFor("Acme Sans Italic")).not.toBe(
      deviceFontIdFor("Acme Sans"),
    );
  });

  it("downloads only the face that answers the request", async () => {
    serveManifestAndFaces();
    await loadServerFonts();

    const regular = await loadServerFontBytes("Acme Sans");
    expect(regular?.[0]).toBe(1);
    expect(faceRequests()).toEqual([`${SERVER_FONTS_URL}/${REGULAR}`]);

    const italic = await loadServerFontBytes("Acme Sans Italic");
    expect(italic?.[0]).toBe(2);
    expect(faceRequests()).toEqual([
      `${SERVER_FONTS_URL}/${REGULAR}`,
      `${SERVER_FONTS_URL}/${ITALIC}`,
    ]);

    await loadServerFontBytes("Acme Sans");
    expect(faceRequests()).toHaveLength(2);
    expect(getServerFontBytes("acme sans")?.[0]).toBe(1);
  });

  it("downloads a face once when two names ask for it together", async () => {
    serveManifestAndFaces();
    await loadServerFonts();

    await Promise.all([
      loadServerFontBytes("Acme Sans Bold"),
      loadServerFontBytes("AcmeSans-Bold"),
    ]);

    expect(faceRequests()).toEqual([`${SERVER_FONTS_URL}/${BOLD}`]);
  });

  it("retries a face download once, then gives up without throwing", async () => {
    let faceCalls = 0;
    get.mockImplementation(async (url: string) => {
      if (url === SERVER_FONTS_URL) return { data: MANIFEST };
      faceCalls++;
      if (faceCalls === 1) throw new Error("404 on a node without the file");
      return { data: bytesFor(REGULAR) };
    });

    expect(await loadServerFontBytes("Acme Sans")).not.toBeNull();
    expect(faceCalls).toBe(2);

    resetServerFontsCache();
    faceCalls = 0;
    get.mockImplementation(async (url: string) => {
      if (url === SERVER_FONTS_URL) return { data: MANIFEST };
      faceCalls++;
      throw new Error("gone");
    });
    expect(await loadServerFontBytes("Acme Sans")).toBeNull();
    expect(faceCalls).toBe(2);
    expect(getServerFontBytes("Acme Sans")).toBeNull();
  });

  it("returns null for a family the server does not have", async () => {
    serveManifestAndFaces();

    expect(await loadServerFontBytes("Comic Sans")).toBeNull();
    expect(faceRequests()).toEqual([]);
  });

  it("lists server faces ahead of device faces of the same family", async () => {
    serveManifestAndFaces();
    (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts = vi.fn(
      async () => [
        {
          family: "Acme Sans",
          fullName: "Acme Sans",
          style: "Regular",
          postscriptName: "AcmeSans-Device",
          blob: async () => ({
            arrayBuffer: async () => new Uint8Array([9, 9, 9, 9]).buffer,
          }),
        },
        {
          family: "Calibri",
          fullName: "Calibri",
          style: "Regular",
          postscriptName: "Calibri",
        },
      ],
    );
    await listLocalFonts();
    await loadServerFonts();

    const merged = loadedExternalFonts();
    expect(merged?.map((font) => font.postscriptName)).toEqual([
      "AcmeSans-Regular",
      "AcmeSans-Italic",
      "AcmeSans-Bold",
      "Calibri",
    ]);
    expect(loadedExternalFonts()).toBe(merged);

    await loadServerFontBytes("Acme Sans");
    expect(getExternalFontBytes("Acme Sans")?.[0]).toBe(1);
  });

  it("offers italic for a server family that has an italic cut", async () => {
    serveManifestAndFaces();
    await loadServerFonts();

    expect(italicCapability("device:Acme Sans", true)).toEqual({
      family: "Acme Sans Italic",
      source: "device",
    });
    expect(italicCapability("device:Acme Sans Bold", true)).toEqual({
      family: null,
      source: null,
    });
  });

  it("italicises a server Times New Roman with its own italic face", async () => {
    get.mockResolvedValue({
      data: {
        families: [
          {
            family: "Times New Roman",
            faces: [
              face("6".repeat(64), "Regular", false, false),
              face("7".repeat(64), "Italic", false, true),
            ],
          },
        ],
      },
    });
    expect(italicCapability("pdf:1:Times New Roman", true)).toEqual({
      family: "Times-Italic",
      source: "base14",
    });

    const fonts = await loadServerFonts();

    expect(italicCapability("device:Times New Roman", true)).toEqual({
      family: "Times New Roman Italic",
      source: "device",
    });
    expect(italicCapability("device:Times New Roman Italic", false)).toEqual({
      family: "Times New Roman",
      source: "device",
    });
    expect(
      pickLocalFontFace(fonts ?? [], "Times New Roman Italic")?.style,
    ).toBe("Italic");
    expect(italicCapability("base14:Times-Roman", true)).toEqual({
      family: "Times-Italic",
      source: "base14",
    });
  });
});
