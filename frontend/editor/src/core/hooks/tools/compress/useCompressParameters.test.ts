import { describe, expect, test } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCompressParameters } from "@app/hooks/tools/compress/useCompressParameters";

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
