import { describe, expect, test } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  defaultParameters,
  MAX_COMPRESSION_LEVEL,
  useCompressParameters,
  usedStrongestCompression,
} from "@editor/hooks/tools/compress/useCompressParameters";

describe("useCompressParameters", () => {
  test("defaults (quality mode) validate", () => {
    const { result } = renderHook(() => useCompressParameters());

    expect(result.current.validateParameters()).toBe(true);
  });

  test("compressionLevel outside 1-9 is invalid", () => {
    const { result } = renderHook(() => useCompressParameters());

    act(() => {
      result.current.updateParameter("compressionLevel", 0);
    });
    expect(result.current.validateParameters()).toBe(false);

    act(() => {
      result.current.updateParameter("compressionLevel", 10);
    });
    expect(result.current.validateParameters()).toBe(false);
  });

  test("filesize mode requires a target size", () => {
    const { result } = renderHook(() => useCompressParameters());

    // Filesize mode with no size entered must not validate: otherwise the
    // request omits expectedOutputSize and the backend silently falls back to a
    // quality compression.
    act(() => {
      result.current.updateParameter("compressionMethod", "filesize");
    });
    expect(result.current.validateParameters()).toBe(false);

    act(() => {
      result.current.updateParameter("fileSizeValue", "5");
    });
    expect(result.current.validateParameters()).toBe(true);
  });
});

describe("usedStrongestCompression", () => {
  test("is false below the top quality level", () => {
    expect(
      usedStrongestCompression({ ...defaultParameters, compressionLevel: 8 }),
    ).toBe(false);
  });

  test("is true at the top quality level", () => {
    expect(
      usedStrongestCompression({
        ...defaultParameters,
        compressionLevel: MAX_COMPRESSION_LEVEL,
      }),
    ).toBe(true);
  });

  test("is true in file-size mode, which escalates the level itself", () => {
    expect(
      usedStrongestCompression({
        ...defaultParameters,
        compressionMethod: "filesize",
        compressionLevel: 1,
      }),
    ).toBe(true);
  });
});
