import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudUrl } from "@processor/components/account-link/cloudLinks";

describe("cloudUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the cloud the server is linked to over the build default", () => {
    vi.stubEnv("VITE_SAAS_FRONTEND_URL", "https://stirling.com/app");
    expect(cloudUrl("/settings/billing", "http://localhost:5174/")).toBe(
      "http://localhost:5174/settings/billing",
    );
  });

  it("falls back to the build default for a server linked before clouds reported it", () => {
    vi.stubEnv("VITE_SAAS_FRONTEND_URL", "https://stirling.com/app/");
    expect(cloudUrl("/settings/billing", null)).toBe(
      "https://stirling.com/app/settings/billing",
    );
  });

  it("gives no link when neither is known", () => {
    vi.stubEnv("VITE_SAAS_FRONTEND_URL", "");
    expect(cloudUrl("/settings/billing")).toBeNull();
  });
});
