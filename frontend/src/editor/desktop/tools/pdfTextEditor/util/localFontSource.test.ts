import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import {
  listDeviceFaces,
  localFontPermission,
  readDeviceFace,
} from "@editor/tools/pdfTextEditor/util/localFontSource";
import {
  faceStyleFlags,
  familyOptions,
  pickLocalFontFace,
} from "@editor/tools/pdfTextEditor/util/localFonts";

const ARIAL = {
  id: 7,
  family: "Arial",
  fullName: "Arial Bold",
  style: "Bold",
  postscriptName: "Arial-BoldMT",
  weight: 700,
  bold: true,
  italic: false,
};

function germanFace(style: string, weight: number, italic: boolean) {
  return {
    id: weight + (italic ? 1 : 0),
    family: "Arial",
    fullName: `Arial ${style}`,
    style,
    postscriptName: "Arial",
    weight,
    bold: weight >= 600,
    italic,
  };
}

describe("desktop local font source", () => {
  beforeEach(() => invoke.mockReset());

  it("never needs a permission prompt", async () => {
    await expect(localFontPermission()).resolves.toBe("granted");
  });

  it("lists the installed faces from the native side", async () => {
    invoke.mockResolvedValue([ARIAL]);
    const faces = await listDeviceFaces();
    expect(invoke).toHaveBeenCalledWith("list_system_fonts");
    expect(faces).toEqual([
      {
        family: "Arial",
        fullName: "Arial Bold",
        style: "Bold",
        postscriptName: "Arial-BoldMT",
        axes: { weight: 700, bold: true, italic: false },
      },
    ]);
  });

  it("reads bold and italic from the native axes, not the localized style name", async () => {
    invoke.mockResolvedValue([
      germanFace("Standard", 400, false),
      germanFace("Fett", 700, false),
      germanFace("Kursiv", 400, true),
      germanFace("Fett Kursiv", 700, true),
    ]);
    const faces = await listDeviceFaces();
    expect(faces.map(faceStyleFlags)).toEqual([
      { bold: false, italic: false },
      { bold: true, italic: false },
      { bold: false, italic: true },
      { bold: true, italic: true },
    ]);
    expect(pickLocalFontFace(faces, "Arial")?.style).toBe("Standard");
    expect(pickLocalFontFace(faces, "Arial Bold")?.style).toBe("Fett");
    expect(familyOptions(faces, []).map((o) => o.value)).toEqual([
      "Arial",
      "Arial Bold",
    ]);
  });

  it("reads a face's file by the id it was listed with", async () => {
    invoke.mockResolvedValueOnce([ARIAL]);
    const [face] = await listDeviceFaces();
    invoke.mockResolvedValueOnce(new Uint8Array([0, 1, 0, 0]).buffer);
    const bytes = await readDeviceFace(face);
    expect(invoke).toHaveBeenLastCalledWith("read_system_font", { id: 7 });
    expect([...bytes!]).toEqual([0, 1, 0, 0]);
  });

  it("reads nothing for a face it did not list", async () => {
    await expect(
      readDeviceFace({ ...ARIAL, fullName: "Arial" }),
    ).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reads nothing when the native read fails", async () => {
    invoke.mockResolvedValueOnce([ARIAL]);
    const [face] = await listDeviceFaces();
    invoke.mockRejectedValueOnce(new Error("Unknown system font"));
    await expect(readDeviceFace(face)).resolves.toBeNull();
  });
});
