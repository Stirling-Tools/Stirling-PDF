import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePolicies } from "@app/hooks/usePolicies";

describe("usePolicies", () => {
  beforeEach(() => localStorage.clear());

  it("seeds ingestion active and the rest unconfigured", () => {
    const { result } = renderHook(() => usePolicies());
    expect(result.current.policies.ingestion.configured).toBe(true);
    expect(result.current.policies.ingestion.status).toBe("active");
    expect(result.current.policies.security.configured).toBe(false);
  });

  it("enabling a policy marks it configured + active", () => {
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
  });

  it("pausing then resuming flips status", () => {
    const { result } = renderHook(() => usePolicies());
    act(() => result.current.pausePolicy("ingestion"));
    expect(result.current.policies.ingestion.status).toBe("paused");
    act(() => result.current.resumePolicy("ingestion"));
    expect(result.current.policies.ingestion.status).toBe("active");
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

  it("spend limit is disabled by default (no warning/reached)", () => {
    const { result } = renderHook(() => usePolicies());
    expect(result.current.spendLimitReached).toBe(false);
    expect(result.current.spendLimitWarning).toBe(false);
  });
});
