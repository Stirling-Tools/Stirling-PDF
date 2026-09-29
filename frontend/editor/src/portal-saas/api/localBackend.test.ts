import { afterEach, describe, expect, it, vi } from "vitest";

const getPortalSaasToken = vi.fn();
vi.mock("@portal/auth/portalSaasSession", () => ({
  getPortalSaasToken: () => getPortalSaasToken(),
}));
vi.mock("@portal/api/saasApiBase", () => ({
  saasApiBase: () => "https://saas.example",
}));

// Resolves to the SaaS override (src/portal-saas) via the @portal cascade.
import { localBaseUrl, localAuthHeader } from "@portal/api/localBackend";

describe("localBackend (SaaS) — apiClient.local IS the SaaS backend", () => {
  afterEach(() => getPortalSaasToken.mockReset());

  it("targets the SaaS backend base, not same-origin", () => {
    expect(localBaseUrl()).toBe("https://saas.example");
  });

  it("authenticates with the Supabase JWT", async () => {
    getPortalSaasToken.mockResolvedValue("supabase-jwt");
    expect(await localAuthHeader()).toEqual({
      Authorization: "Bearer supabase-jwt",
    });
  });

  it("sends no auth header when there is no session", async () => {
    getPortalSaasToken.mockResolvedValue(null);
    expect(await localAuthHeader()).toEqual({});
  });
});
