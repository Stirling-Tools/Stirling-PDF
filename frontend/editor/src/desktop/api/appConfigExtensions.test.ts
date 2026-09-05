import { describe, expect, test, vi, beforeEach } from "vitest";

// Connected to a self-hosted server, the app-config comes from that server, and
// it answers hardwareSigningAvailable for itself: false, because it is not the
// user's machine. The app then hid "This device" as a certificate source even
// though the store was right there (#7316). That one field is re-answered here.

// vi.mock factories are hoisted above top-level consts, so the double has to be
// hoisted too or it is still in its TDZ when the factory runs.
const { getHardwareSigningCapabilities } = vi.hoisted(() => ({
  getHardwareSigningCapabilities: vi.fn(),
}));

vi.mock("@app/services/hardwareSigningService", () => ({
  getHardwareSigningCapabilities,
}));

import { applyDeviceCapabilities } from "@app/api/appConfigExtensions";

const capabilities = (desktop: boolean) => ({
  desktop,
  osName: "Windows 11",
  windowsStoreSupported: desktop,
  pkcs11Supported: desktop,
  detectedLibraries: [],
});

describe("applyDeviceCapabilities - hardware signing is answered by this machine", () => {
  beforeEach(() => {
    getHardwareSigningCapabilities.mockReset();
  });

  test("this machine's answer wins over a backend that says no", async () => {
    getHardwareSigningCapabilities.mockResolvedValue(capabilities(true));

    await expect(
      applyDeviceCapabilities({
        enableLogin: true,
        hardwareSigningAvailable: false,
      }),
    ).resolves.toMatchObject({ hardwareSigningAvailable: true });
  });

  test("a machine without hardware support still reports false", async () => {
    getHardwareSigningCapabilities.mockResolvedValue(capabilities(false));

    await expect(
      applyDeviceCapabilities({ hardwareSigningAvailable: true }),
    ).resolves.toMatchObject({ hardwareSigningAvailable: false });
  });

  test("every other field is left exactly as the backend sent it", async () => {
    // Only the field describing this computer is re-answered; the rest describes
    // the deployment, and there the server is the authority.
    getHardwareSigningCapabilities.mockResolvedValue(capabilities(true));

    await expect(
      applyDeviceCapabilities({
        enableLogin: false,
        serverCertificateEnabled: true,
        hardwareSigningAvailable: false,
      }),
    ).resolves.toEqual({
      enableLogin: false,
      serverCertificateEnabled: true,
      hardwareSigningAvailable: true,
    });
  });

  test("if the capability call fails, the backend's value stands", async () => {
    // Losing the local probe must not take the whole config down with it.
    getHardwareSigningCapabilities.mockRejectedValue(new Error("no backend"));

    await expect(
      applyDeviceCapabilities({
        enableLogin: true,
        hardwareSigningAvailable: false,
      }),
    ).resolves.toEqual({ enableLogin: true, hardwareSigningAvailable: false });
  });
});
