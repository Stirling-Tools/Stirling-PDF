import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  clearToolPresetRequest,
  requestToolPreset,
  useToolPresetRequest,
} from "@app/services/toolPresetRequests";

describe("tool preset requests", () => {
  it("holds a request until the tool's consumer mounts, then applies it once", () => {
    requestToolPreset("convert", "pdf-to-png");
    const apply = vi.fn();
    const { rerender } = renderHook(() =>
      useToolPresetRequest("convert", apply),
    );
    expect(apply).toHaveBeenCalledExactlyOnceWith("pdf-to-png");
    rerender();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("applies a request made while the tool is open, even a repeat", () => {
    const apply = vi.fn();
    renderHook(() => useToolPresetRequest("convert", apply));
    act(() => requestToolPreset("convert", "pdf-to-png"));
    act(() => requestToolPreset("convert", "pdf-to-png"));
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("leaves another tool's request alone, and drops it on switching away", () => {
    const apply = vi.fn();
    renderHook(() => useToolPresetRequest("compress", apply));
    act(() => requestToolPreset("convert", "pdf-to-png"));
    expect(apply).not.toHaveBeenCalled();

    act(() => clearToolPresetRequest("compress"));
    const convertApply = vi.fn();
    renderHook(() => useToolPresetRequest("convert", convertApply));
    expect(convertApply).not.toHaveBeenCalled();
  });
});
