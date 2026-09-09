import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadPolicies,
  updatePolicy,
  resetPolicy,
  onPoliciesChange,
} from "@app/services/policyStorage";

describe("policyStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults every category to unconfigured (backend is the source of truth)", () => {
    const p = loadPolicies();
    expect(p.ingestion.configured).toBe(false);
    expect(p.ingestion.status).toBe("default");
    expect(p.security.configured).toBe(false);
    expect(p.security.status).toBe("default");
    expect(p.retention.configured).toBe(false);
  });

  it("persists an update and reflects it on reload", () => {
    updatePolicy("security", { configured: true, status: "active" });
    const reloaded = loadPolicies();
    expect(reloaded.security.configured).toBe(true);
    expect(reloaded.security.status).toBe("active");
    // Other categories untouched.
    expect(reloaded.retention.configured).toBe(false);
  });

  it("merges partial field-value updates without clobbering siblings", () => {
    updatePolicy("security", { fieldValues: { detectPII: false } });
    updatePolicy("security", { reviewerEmail: "x@y.com" });
    const p = loadPolicies();
    expect(p.security.fieldValues).toEqual({ detectPII: false });
    expect(p.security.reviewerEmail).toBe("x@y.com");
  });

  it("resetPolicy reverts a category to unconfigured default", () => {
    updatePolicy("compliance", {
      configured: true,
      status: "active",
      reviewerEmail: "a@b.com",
    });
    resetPolicy("compliance");
    const p = loadPolicies();
    expect(p.compliance.configured).toBe(false);
    expect(p.compliance.status).toBe("default");
  });

  it("heals missing categories from corrupt/partial storage", () => {
    localStorage.setItem(
      "stirling-policies-state",
      JSON.stringify({ ingestion: { configured: true, status: "active" } }),
    );
    const p = loadPolicies();
    // Missing category gets a default rather than being undefined.
    expect(p.routing).toBeDefined();
    expect(p.routing.configured).toBe(false);
  });

  it("fires a change event on update", () => {
    const cb = vi.fn();
    const off = onPoliciesChange(cb);
    updatePolicy("routing", { status: "paused" });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    updatePolicy("routing", { status: "active" });
    expect(cb).toHaveBeenCalledTimes(1); // not called after unsubscribe
  });
});
