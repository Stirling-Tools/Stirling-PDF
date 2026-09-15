import { afterEach, describe, expect, it, vi } from "vitest";

const getProcessorSaasToken = vi.fn();
vi.mock("@processor/auth/processorSaasSession", () => ({
  getProcessorSaasToken: () => getProcessorSaasToken(),
}));
vi.mock("@processor/api/saasApiBase", () => ({
  saasApiBase: () => "https://saas.example",
}));

// Resolves to the SaaS override (src/processor-saas) via the @processor cascade.
import { localBaseUrl, localAuthHeader } from "@processor/api/localBackend";

describe("localBackend (SaaS) — apiClient.local IS the SaaS backend", () => {
  afterEach(() => getProcessorSaasToken.mockReset());

  it("targets the SaaS backend base, not same-origin", () => {
    expect(localBaseUrl()).toBe("https://saas.example");
  });

  it("authenticates with the Supabase JWT", async () => {
    getProcessorSaasToken.mockResolvedValue("supabase-jwt");
    expect(await localAuthHeader()).toEqual({
      Authorization: "Bearer supabase-jwt",
    });
  });

  it("sends no auth header when there is no session", async () => {
    getProcessorSaasToken.mockResolvedValue(null);
    expect(await localAuthHeader()).toEqual({});
  });
});
