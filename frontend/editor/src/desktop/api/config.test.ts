import { describe, expect, test, vi, beforeEach } from "vitest";

// Connected to a self-hosted server, the app-config comes from that server, and
// it answers hardwareSigningAvailable for itself: false, because it is not a
// desktop. The desktop then hides "This device" as a certificate source even
// though the store is right there (#7316). The flag is re-answered locally.

// vi.mock factories are hoisted above top-level consts, so the doubles have to
// be hoisted too or they are still in their TDZ when the factory runs.
const { fetchCoreAppConfig, getHardwareSigningCapabilities } = vi.hoisted(
  () => ({
    fetchCoreAppConfig: vi.fn(),
    getHardwareSigningCapabilities: vi.fn(),
  }),
);

vi.mock("@core/api/config", () => ({
  fetchAppConfig: fetchCoreAppConfig,
  DEFAULT_APP_CONFIG: { enableLogin: true },
  fetchEndpointsAvailability: vi.fn(),
  fetchEndpointEnabled: vi.fn(),
  fetchFooterInfo: vi.fn(),
  fetchGroupEnabled: vi.fn(),
}));
vi.mock("@app/services/hardwareSigningService", () => ({
  getHardwareSigningCapabilities,
}));

import { fetchAppConfig } from "@app/api/config";

const capabilities = (desktop: boolean) => ({
  desktop,
  osName: "Windows 11",
  windowsStoreSupported: desktop,
  pkcs11Supported: desktop,
  detectedLibraries: [],
});

describe("desktop fetchAppConfig - hardware signing is answered by this machine", () => {
  beforeEach(() => {
    fetchCoreAppConfig.mockReset();
    getHardwareSigningCapabilities.mockReset();
  });

  test("the local answer wins over a server that says no", async () => {
    fetchCoreAppConfig.mockResolvedValue({
      enableLogin: true,
      hardwareSigningAvailable: false,
    });
    getHardwareSigningCapabilities.mockResolvedValue(capabilities(true));

    await expect(fetchAppConfig()).resolves.toMatchObject({
      hardwareSigningAvailable: true,
    });
  });

  test("a machine without hardware support still reports false", async () => {
    fetchCoreAppConfig.mockResolvedValue({ hardwareSigningAvailable: true });
    getHardwareSigningCapabilities.mockResolvedValue(capabilities(false));

    await expect(fetchAppConfig()).resolves.toMatchObject({
      hardwareSigningAvailable: false,
    });
  });

  test("every other field is left exactly as the backend sent it", async () => {
    // Only the flag describing this computer is re-answered; the rest describes
    // the deployment, and there the server is the authority.
    fetchCoreAppConfig.mockResolvedValue({
      enableLogin: false,
      serverCertificateEnabled: true,
      hardwareSigningAvailable: false,
    });
    getHardwareSigningCapabilities.mockResolvedValue(capabilities(true));

    await expect(fetchAppConfig()).resolves.toEqual({
      enableLogin: false,
      serverCertificateEnabled: true,
      hardwareSigningAvailable: true,
    });
  });

  test("if the capability call fails, the backend's value stands", async () => {
    // Losing the local probe must not take the whole config down with it.
    fetchCoreAppConfig.mockResolvedValue({
      enableLogin: true,
      hardwareSigningAvailable: false,
    });
    getHardwareSigningCapabilities.mockRejectedValue(new Error("no backend"));

    await expect(fetchAppConfig()).resolves.toEqual({
      enableLogin: true,
      hardwareSigningAvailable: false,
    });
  });
});
