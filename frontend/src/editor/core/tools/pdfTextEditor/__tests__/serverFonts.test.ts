import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import {
  SERVER_FONTS_URL,
  getServerFontBytes,
  isServerFontFamily,
  loadServerFontBytes,
  loadServerFonts,
  loadedServerFonts,
  resetServerFontsCache,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import {
  getExternalFontBytes,
  loadedExternalFonts,
} from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  listLocalFonts,
  resetLocalFontsCache,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  italicCapability,
  resetDocumentFontMatchCache,
} from "@editor/tools/pdfTextEditor/util/fontCapability";

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
  beforeEach(() => {
    get.mockReset();
    resetServerFontsCache();
    resetLocalFontsCache();
    resetDocumentFontMatchCache();
    delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
  });

  it("fetches nothing until asked", () => {
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
    expect(isServerFontFamily("acme-sans")).toBe(true);
    expect(isServerFontFamily("Other")).toBe(false);
  });

  it("retries the manifest after a failed fetch", async () => {
    get.mockRejectedValueOnce(new Error("offline"));
    expect(await loadServerFonts()).toBeNull();

    serveManifestAndFaces();
    expect(await loadServerFonts()).toHaveLength(3);
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
});
