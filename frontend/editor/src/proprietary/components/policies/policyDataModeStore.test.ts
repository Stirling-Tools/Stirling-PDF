import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  usePolicyDataMode,
  setPolicyDataMode,
} from "@app/components/policies/policyDataModeStore";

describe("policyDataModeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    setPolicyDataMode("mock");
  });

  it("defaults to mock, toggles to live, and persists", () => {
    const { result } = renderHook(() => usePolicyDataMode());
    expect(result.current).toBe("mock");

    act(() => setPolicyDataMode("live"));
    expect(result.current).toBe("live");
    expect(localStorage.getItem("stirling-policies-data-mode")).toBe("live");

    act(() => setPolicyDataMode("mock"));
    expect(result.current).toBe("mock");
  });
});
