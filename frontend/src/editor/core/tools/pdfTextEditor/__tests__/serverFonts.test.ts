import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import {
  SERVER_FONTS_REFRESH_MS,
  SERVER_FONTS_URL,
  forgetServerFontList,
  getServerFontBytes,
  loadServerFontBytes,
  loadServerFonts,
  loadedServerFonts,
  serverFaceFor,
  serverFontCssFamily,
  subscribeServerFonts,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import {
  getExternalFontBytes,
  loadedExternalFonts,
} from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  familyOptions,
  listLocalFonts,
  pickLocalFontFace,
  resetLocalFontsCache,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import { deviceFontIdFor } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import { italicCapability } from "@editor/tools/pdfTextEditor/util/fontCapability";
import { resetFontCompletions } from "@editor/tools/pdfTextEditor/util/documentFontCompletion";

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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (document as unknown as { fonts?: unknown }).fonts;
  });

  beforeEach(() => {
    get.mockReset();
    forgetServerFontList();
    resetLocalFontsCache();
    resetFontCompletions();
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

  it("keeps an empty answer instead of asking again straight away", async () => {
    get.mockResolvedValue({ data: { families: [] } });

    expect(await loadServerFonts()).toEqual([]);
    expect(await loadServerFonts()).toEqual([]);
    expect(loadedServerFonts()).toEqual([]);
    expect(await loadServerFontBytes("Acme Sans")).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);

    forgetServerFontList();
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

  it("drops the old backend's faces and bytes when the backend changes", async () => {
    const added: unknown[] = [];
    const removed: unknown[] = [];
    vi.stubGlobal(
      "FontFace",
      class {
        load() {
          return Promise.resolve(this);
        }
      },
    );
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        add: (css: unknown) => added.push(css),
        delete: (css: unknown) => removed.push(css),
      },
    });
    serveManifestAndFaces();
    expect((await loadServerFontBytes("Acme Sans"))?.[0]).toBe(1);
    expect(serverFontCssFamily("Acme Sans")).toBe(`serverface-${REGULAR}`);

    forgetServerFontList();

    expect(getServerFontBytes("Acme Sans")).toBeNull();
    expect(getExternalFontBytes("Acme Sans")).toBeNull();
    expect(serverFontCssFamily("Acme Sans")).toBeNull();
    expect(removed).toEqual(added);

    const OTHER = "8".repeat(64);
    get.mockImplementation(async (url: string) => {
      if (url === SERVER_FONTS_URL) {
        return {
          data: {
            families: [
              {
                family: "Acme Sans",
                faces: [face(OTHER, "Regular", false, false)],
              },
            ],
          },
        };
      }
      return { data: bytesFor(url.slice(SERVER_FONTS_URL.length + 1)) };
    });
    expect((await loadServerFontBytes("Acme Sans"))?.[0]).toBe(8);
    expect(getServerFontBytes("Acme Sans")?.[0]).toBe(8);
    expect(serverFontCssFamily("Acme Sans")).toBe(`serverface-${OTHER}`);
  });

  it("ignores a face download that finishes after the backend changed", async () => {
    let finishOldDownload: (value: { data: ArrayBuffer }) => void = () => {};
    get.mockImplementation((url: string) => {
      if (url === SERVER_FONTS_URL) return Promise.resolve({ data: MANIFEST });
      return new Promise((resolve) => {
        finishOldDownload = resolve;
      });
    });
    const fromOldServer = loadServerFontBytes("Acme Sans");
    await vi.waitFor(() => expect(faceRequests()).toHaveLength(1));

    forgetServerFontList();
    let finishNewDownload: (value: { data: ArrayBuffer }) => void = () => {};
    get.mockImplementation((url: string) => {
      if (url === SERVER_FONTS_URL) return Promise.resolve({ data: MANIFEST });
      return new Promise((resolve) => {
        finishNewDownload = resolve;
      });
    });
    const fromNewServer = loadServerFontBytes("Acme Sans");
    await vi.waitFor(() => expect(faceRequests()).toHaveLength(2));

    finishOldDownload({ data: new Uint8Array([7, 7, 7, 7]).buffer });
    expect(await fromOldServer).toBeNull();
    expect(getServerFontBytes("Acme Sans")).toBeNull();
    const askedAgain = loadServerFontBytes("Acme Sans");

    finishNewDownload({ data: bytesFor(REGULAR) });
    expect((await fromNewServer)?.[0]).toBe(1);
    expect(getServerFontBytes("Acme Sans")?.[0]).toBe(1);
    expect((await askedAgain)?.[0]).toBe(1);
    expect(faceRequests()).toHaveLength(2);
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

    forgetServerFontList();
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

  it("revalidates the list once it is stale and publishes only a change", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    serveManifestAndFaces();
    const first = await loadServerFonts();
    const listener = vi.fn();
    const unsubscribe = subscribeServerFonts(listener);

    now += SERVER_FONTS_REFRESH_MS - 1;
    expect(await loadServerFonts()).toBe(first);
    expect(get).toHaveBeenCalledTimes(1);

    now += 1;
    loadServerFonts();
    loadServerFonts();
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
    expect(loadedServerFonts()).toBe(first);

    get.mockResolvedValue({
      data: {
        families: [
          {
            family: "Beta Serif",
            faces: [face("5".repeat(64), "Regular", false, false)],
          },
        ],
      },
    });
    now += SERVER_FONTS_REFRESH_MS;
    loadServerFonts();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(loadedServerFonts()?.map((font) => font.family)).toEqual([
      "Beta Serif",
    ]);
    unsubscribe();
  });

  it("asks for the list again after a face fails to download", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    get.mockImplementation(async (url: string) => {
      if (url === SERVER_FONTS_URL) return { data: MANIFEST };
      throw new Error("gone");
    });

    expect(await loadServerFontBytes("Acme Sans")).toBeNull();
    loadServerFonts();

    await vi.waitFor(() =>
      expect(
        get.mock.calls.filter(([url]) => url === SERVER_FONTS_URL),
      ).toHaveLength(2),
    );
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

  it("loads the new face after a refresh replaces the one already loaded", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    serveManifestAndFaces();
    expect((await loadServerFontBytes("Acme Sans"))?.[0]).toBe(1);

    const REPLACED = "9".repeat(64);
    get.mockImplementation(async (url: string) => {
      if (url === SERVER_FONTS_URL) {
        return {
          data: {
            families: [
              {
                family: "Acme Sans",
                faces: [face(REPLACED, "Regular", false, false)],
              },
            ],
          },
        };
      }
      return { data: bytesFor(url.slice(SERVER_FONTS_URL.length + 1)) };
    });
    const listener = vi.fn();
    const unsubscribe = subscribeServerFonts(listener);
    now += SERVER_FONTS_REFRESH_MS;
    loadServerFonts();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

    expect(serverFaceFor("Acme Sans")?.id).toBe(REPLACED);
    expect(getServerFontBytes("Acme Sans")).toBeNull();
    expect((await loadServerFontBytes("Acme Sans"))?.[0]).toBe(9);
    expect(getExternalFontBytes("Acme Sans")?.[0]).toBe(9);
    unsubscribe();
  });

  it("keeps a loaded face readable when a refresh adds another family", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    serveManifestAndFaces();
    expect((await loadServerFontBytes("Acme Sans"))?.[0]).toBe(1);

    get.mockImplementation(async (url: string) => {
      if (url === SERVER_FONTS_URL) {
        return {
          data: {
            families: [
              ...MANIFEST.families,
              {
                family: "Beta Serif",
                faces: [face("5".repeat(64), "Regular", false, false)],
              },
            ],
          },
        };
      }
      return { data: bytesFor(url.slice(SERVER_FONTS_URL.length + 1)) };
    });
    const listener = vi.fn();
    const unsubscribe = subscribeServerFonts(listener);
    now += SERVER_FONTS_REFRESH_MS;
    loadServerFonts();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

    expect(getServerFontBytes("Acme Sans")?.[0]).toBe(1);
    expect(getExternalFontBytes("Acme Sans")?.[0]).toBe(1);
    unsubscribe();
  });

  it("reads bold and italic from the server, not from the style name", async () => {
    get.mockResolvedValue({
      data: {
        families: [
          {
            family: "Acme Sans",
            faces: [
              face(REGULAR, "Standard", false, false),
              face(ITALIC, "Kursiv", false, true),
              face(BOLD, "Fett", true, false),
            ],
          },
        ],
      },
    });
    const fonts = (await loadServerFonts()) ?? [];

    expect(familyOptions(fonts, []).map((option) => option.value)).toEqual([
      "Acme Sans",
      "Acme Sans Bold",
    ]);
    expect(serverFaceFor("Acme Sans")?.id).toBe(REGULAR);
    expect(serverFaceFor("Acme Sans Bold")?.id).toBe(BOLD);
    expect(serverFaceFor("Acme Sans Italic")?.id).toBe(ITALIC);
    expect(italicCapability("device:Acme Sans", true)).toEqual({
      family: "Acme Sans Italic",
      source: "device",
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
