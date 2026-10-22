import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDefaultSignature } from "@app/hooks/tools/sign/useDefaultSignature";

const KEY = "stirling:sign:default-signature-id";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useDefaultSignature", () => {
  it("reads the stored default on mount", () => {
    localStorage.setItem(KEY, "sig-1");
    const { result } = renderHook(() => useDefaultSignature());
    expect(result.current.defaultId).toBe("sig-1");
  });

  it("persists a new default and clears it", () => {
    const { result } = renderHook(() => useDefaultSignature());
    act(() => result.current.setDefaultId("sig-2"));
    expect(result.current.defaultId).toBe("sig-2");
    expect(localStorage.getItem(KEY)).toBe("sig-2");

    act(() => result.current.setDefaultId(null));
    expect(result.current.defaultId).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the choice for the session when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useDefaultSignature());
    act(() => result.current.setDefaultId("sig-3"));
    expect(result.current.defaultId).toBe("sig-3");
  });
});
