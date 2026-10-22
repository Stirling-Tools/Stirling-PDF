import { describe, expect, test } from "vitest";
import {
  buildCompressFormData,
  compressFromApiParams,
  compressToApiParams,
} from "@app/hooks/tools/compress/useCompressOperation";
import {
  CompressParameters,
  defaultParameters,
} from "@app/hooks/tools/compress/useCompressParameters";

const params = (
  overrides: Partial<CompressParameters>,
): CompressParameters => ({
  ...defaultParameters,
  ...overrides,
});

describe("compressToApiParams", () => {
  test("quality mode sends optimizeLevel and no expectedOutputSize", () => {
    const api = compressToApiParams(
      params({ compressionMethod: "quality", compressionLevel: 7 }),
    );

    expect(api.optimizeLevel).toBe(7);
    expect(api.expectedOutputSize).toBeUndefined();
  });

  test("file-size mode sends expectedOutputSize (level still present for the spec)", () => {
    const api = compressToApiParams(
      params({
        compressionMethod: "filesize",
        fileSizeValue: "100",
        fileSizeUnit: "MB",
      }),
    );

    // optimizeLevel is required by the backend model; the backend recomputes it
    // from the target size, so its presence is harmless.
    expect(api.optimizeLevel).toBeDefined();
    expect(api.expectedOutputSize).toBe("100MB");
  });

  test("omits expectedOutputSize when file-size value is empty", () => {
    const api = compressToApiParams(
      params({ compressionMethod: "filesize", fileSizeValue: "" }),
    );

    expect(api.expectedOutputSize).toBeUndefined();
  });

  test("line-art thresholds only included when line art is enabled", () => {
    const off = compressToApiParams(params({ lineArt: false }));
    expect(off.lineArtThreshold).toBeUndefined();
    expect(off.lineArtEdgeLevel).toBeUndefined();

    const on = compressToApiParams(
      params({ lineArt: true, lineArtThreshold: 40, lineArtEdgeLevel: 2 }),
    );
    expect(on.lineArtThreshold).toBe(40);
    expect(on.lineArtEdgeLevel).toBe(2);
  });

  test("defaults produce the required optimizeLevel field", () => {
    const api = compressToApiParams(defaultParameters);
    expect(api.optimizeLevel).toBe(defaultParameters.compressionLevel);
  });
});

describe("compressFromApiParams", () => {
  test("expectedOutputSize maps back to file-size mode and its value/unit", () => {
    const ui = compressFromApiParams({
      optimizeLevel: 5,
      expectedOutputSize: "25KB",
    });

    expect(ui.compressionMethod).toBe("filesize");
    expect(ui.fileSizeValue).toBe("25");
    expect(ui.fileSizeUnit).toBe("KB");
  });

  test("no expectedOutputSize maps back to quality mode", () => {
    const ui = compressFromApiParams({ optimizeLevel: 8 });

    expect(ui.compressionMethod).toBe("quality");
    expect(ui.compressionLevel).toBe(8);
  });
});

describe("compress round-trip", () => {
  test.each<Partial<CompressParameters>>([
    { compressionMethod: "quality", compressionLevel: 3, grayscale: true },
    {
      compressionMethod: "filesize",
      fileSizeValue: "10",
      fileSizeUnit: "MB",
      linearize: true,
    },
    {
      compressionMethod: "quality",
      lineArt: true,
      lineArtThreshold: 60,
      lineArtEdgeLevel: 3,
    },
  ])("toApiParams(fromApiParams(x)) reproduces x %o", (overrides) => {
    const api = compressToApiParams(params(overrides));
    const roundTripped = compressToApiParams(
      params(compressFromApiParams(api)),
    );

    expect(roundTripped).toEqual(api);
  });
});

describe("buildCompressFormData", () => {
  test("appends the file and serialized parameters", () => {
    const file = new File(["x"], "test.pdf", { type: "application/pdf" });
    const formData = buildCompressFormData(
      params({ compressionMethod: "quality", compressionLevel: 6 }),
      file,
    );

    expect(formData.get("fileInput")).toBe(file);
    expect(formData.get("optimizeLevel")).toBe("6");
    expect(formData.get("grayscale")).toBe("false");
  });
});
