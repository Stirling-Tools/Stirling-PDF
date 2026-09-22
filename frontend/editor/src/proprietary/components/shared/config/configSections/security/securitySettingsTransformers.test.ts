import { beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import {
  fetchConnectionsSettings,
  saveConnectionsSettings,
} from "@app/components/shared/config/configSections/security/securitySettingsTransformers";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn() },
}));

describe("SSO auto-login security setting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads active and pending values from security, including pending false", async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => ({
      data: url.endsWith("/security")
        ? { ssoAutoLogin: true, _pending: { ssoAutoLogin: false } }
        : {},
    }));

    const settings = await fetchConnectionsSettings();

    expect(settings.ssoAutoLogin).toBe(true);
    expect(settings._pending?.ssoAutoLogin).toBe(false);
  });

  it("does not read the retired pro-feature key", async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => ({
      data: url.endsWith("/premium")
        ? { proFeatures: { ssoAutoLogin: true } }
        : { ssoAutoLogin: false },
    }));

    expect((await fetchConnectionsSettings()).ssoAutoLogin).toBe(false);
  });

  it.each([true, false])("saves %s under security", (value) => {
    expect(
      saveConnectionsSettings({ ssoAutoLogin: value }).deltaSettings,
    ).toEqual({
      "security.ssoAutoLogin": value,
    });
  });
});
