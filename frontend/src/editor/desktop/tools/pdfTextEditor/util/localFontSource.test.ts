import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import {
  localFontPermission,
  localFontQuery,
} from "@editor/tools/pdfTextEditor/util/localFontSource";

const ARIAL = {
  id: 7,
  family: "Arial",
  fullName: "Arial Bold",
  style: "Bold",
  postscriptName: "Arial-BoldMT",
};

interface Face {
  family: string;
  postscriptName: string;
  blob: () => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }>;
}

describe("desktop local font source", () => {
  beforeEach(() => invoke.mockReset());

  it("never needs a permission prompt", async () => {
    await expect(localFontPermission()).resolves.toBe("granted");
  });

  it("lists the installed faces from the native side", async () => {
    invoke.mockResolvedValue([ARIAL]);
    const faces = (await localFontQuery()!()) as Face[];
    expect(invoke).toHaveBeenCalledWith("list_system_fonts");
    expect(faces).toHaveLength(1);
    expect(faces[0]).toMatchObject({
      family: "Arial",
      postscriptName: "Arial-BoldMT",
    });
  });

  it("reads a face's file by the id it was listed with", async () => {
    invoke.mockResolvedValueOnce([ARIAL]);
    const [face] = (await localFontQuery()!()) as Face[];
    invoke.mockResolvedValueOnce(new Uint8Array([0, 1, 0, 0]).buffer);
    const bytes = new Uint8Array(await (await face.blob()).arrayBuffer());
    expect(invoke).toHaveBeenLastCalledWith("read_system_font", { id: 7 });
    expect([...bytes]).toEqual([0, 1, 0, 0]);
  });
});
