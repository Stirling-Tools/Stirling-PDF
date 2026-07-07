import { afterEach, describe, expect, it, vi } from "vitest";
import { saasApiBase } from "@portal/api/saasApiBase";

describe("saasApiBase — SaaS build (one backend, VITE_API_BASE_URL)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reuses the editor's single backend base", () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
    expect(saasApiBase()).toBe("http://localhost:8080");
  });

  it("trims a trailing slash", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://app.stirling.com/");
    expect(saasApiBase()).toBe("https://app.stirling.com");
  });

  it("maps same-origin '/' to '' — a valid (non-null) base, never 'unconfigured'", () => {
    vi.stubEnv("VITE_API_BASE_URL", "/");
    expect(saasApiBase()).toBe("");
  });
});
