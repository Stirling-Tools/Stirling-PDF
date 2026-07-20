import { afterEach, describe, expect, it, vi } from "vitest";

const getPortalSaasToken = vi.fn();
vi.mock("@processor/auth/portalSaasSession", () => ({
  getPortalSaasToken: () => getPortalSaasToken(),
}));
vi.mock("@processor/api/saasApiBase", () => ({
  saasApiBase: () => "https://saas.example",
}));

// Resolves to the SaaS override (src/portal-saas) via the @processor cascade.
import { localBaseUrl, localAuthHeader } from "@processor/api/localBackend";

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
