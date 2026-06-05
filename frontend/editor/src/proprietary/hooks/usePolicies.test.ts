import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePolicies } from "@app/hooks/usePolicies";

describe("usePolicies", () => {
  beforeEach(() => localStorage.clear());

  it("starts with ingestion active and base per-doc cost", () => {
    const { result } = renderHook(() => usePolicies());
    expect(result.current.activePolicyCount).toBe(1);
    expect(result.current.perDocCost).toBeCloseTo(0.02);
    expect(result.current.policies.security.configured).toBe(false);
  });

  it("enabling a policy raises the active count and scales cost", () => {
    const { result } = renderHook(() => usePolicies());
    act(() =>
      result.current.enablePolicy("security", {
        sources: ["editor"],
        scopeTypes: [],
        reviewerEmail: "x@y.com",
        fieldValues: {},
      }),
    );
    expect(result.current.policies.security.configured).toBe(true);
    expect(result.current.policies.security.status).toBe("active");
    expect(result.current.activePolicyCount).toBe(2);
    expect(result.current.perDocCost).toBeCloseTo(0.04);
  });

  it("pausing excludes a policy from the active count", () => {
    const { result } = renderHook(() => usePolicies());
    act(() => result.current.pausePolicy("ingestion"));
    expect(result.current.policies.ingestion.status).toBe("paused");
    expect(result.current.activePolicyCount).toBe(0);
    act(() => result.current.resumePolicy("ingestion"));
    expect(result.current.activePolicyCount).toBe(1);
  });

  it("deleting a policy reverts it to unconfigured", () => {
    const { result } = renderHook(() => usePolicies());
    act(() =>
      result.current.enablePolicy("routing", {
        sources: ["editor"],
        scopeTypes: [],
        reviewerEmail: "x@y.com",
        fieldValues: {},
      }),
    );
    expect(result.current.policies.routing.configured).toBe(true);
    act(() => result.current.deletePolicy("routing"));
    expect(result.current.policies.routing.configured).toBe(false);
    expect(result.current.policies.routing.status).toBe("default");
  });

  it("spend limit reached is derived from the limit + usage", () => {
    const { result } = renderHook(() => usePolicies());
    act(() =>
      result.current.setSpendLimit({
        enabled: true,
        limit: 100,
        used: 100,
        period: "monthly",
      }),
    );
    expect(result.current.spendLimitReached).toBe(true);
  });
});
