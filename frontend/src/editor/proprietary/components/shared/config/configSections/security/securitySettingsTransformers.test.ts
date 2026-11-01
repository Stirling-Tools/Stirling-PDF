// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "@editor/services/apiClient";
import {
  fetchConnectionsSettings,
  saveConnectionsSettings,
  fetchSecuritySettings,
  saveSecuritySettings,
} from "@editor/components/shared/config/configSections/security/securitySettingsTransformers";

vi.mock("@editor/services/apiClient", () => ({
  default: { get: vi.fn() },
}));

describe("PDF owner-password policy", () => {
  it("keeps an explicit disabled setting through pending changes and save", async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => ({
      data: url.endsWith("/security")
        ? {
            honorOwnerPasswords: true,
            _pending: { honorOwnerPasswords: false },
          }
        : {},
    }));
    const settings = await fetchSecuritySettings();
    expect(settings.honorOwnerPasswords).toBe(true);
    expect(settings._pending?.honorOwnerPasswords).toBe(false);
    expect(
      saveSecuritySettings({ honorOwnerPasswords: false }).deltaSettings[
        "security.honorOwnerPasswords"
      ],
    ).toBe(false);
  });
});

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
