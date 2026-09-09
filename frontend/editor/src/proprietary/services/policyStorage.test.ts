import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadPolicies,
  updatePolicy,
  onPoliciesChange,
} from "@app/services/policyStorage";

describe("policyStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults every category to unconfigured (backend is the source of truth)", () => {
    const p = loadPolicies();
    expect(p.ingestion.configured).toBe(false);
    expect(p.ingestion.enabled).toBe(false);
    expect(p.security.configured).toBe(false);
    expect(p.security.enabled).toBe(false);
    expect(p.retention.configured).toBe(false);
  });

  it("persists an update and reflects it on reload", () => {
    updatePolicy("security", { configured: true, enabled: true });
    const reloaded = loadPolicies();
    expect(reloaded.security.configured).toBe(true);
    expect(reloaded.security.enabled).toBe(true);
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

  it("heals missing categories from corrupt/partial storage", () => {
    localStorage.setItem(
      "stirling-policies-state",
      JSON.stringify({ ingestion: { configured: true, enabled: true } }),
    );
    const p = loadPolicies();
    // Missing category gets a default rather than being undefined.
    expect(p.routing).toBeDefined();
    expect(p.routing.configured).toBe(false);
  });

  it("migrates a pre-runsOnEditor row narrowed to non-editor sources off the editor", () => {
    // Stored before runsOnEditor existed: no such field, sources exclude the editor.
    localStorage.setItem(
      "stirling-policies-state",
      JSON.stringify({
        security: { configured: true, enabled: true, sources: ["s3"] },
      }),
    );
    // Without the migration the default (true) would wrongly win.
    expect(loadPolicies().security.runsOnEditor).toBe(false);
  });

  it("migrates a pre-runsOnEditor row listing the editor onto the editor", () => {
    localStorage.setItem(
      "stirling-policies-state",
      JSON.stringify({
        security: { configured: true, enabled: true, sources: ["editor"] },
      }),
    );
    expect(loadPolicies().security.runsOnEditor).toBe(true);
  });

  it("leaves an explicit runsOnEditor untouched", () => {
    localStorage.setItem(
      "stirling-policies-state",
      JSON.stringify({
        security: {
          configured: true,
          enabled: true,
          sources: ["editor"],
          runsOnEditor: false,
        },
      }),
    );
    expect(loadPolicies().security.runsOnEditor).toBe(false);
  });

  it("fires a change event on update", () => {
    const cb = vi.fn();
    const off = onPoliciesChange(cb);
    updatePolicy("routing", { enabled: false });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    updatePolicy("routing", { enabled: true });
    expect(cb).toHaveBeenCalledTimes(1); // not called after unsubscribe
  });
});
