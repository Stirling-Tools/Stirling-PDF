import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateService } from "@app/services/updateService";
import { DOWNLOAD_URLS } from "@app/constants/downloads";

type MachineInfo = Parameters<typeof updateService.getDownloadUrl>[0];

const stubMachineInfo: MachineInfo = {
  machineType: "Server-jar",
  activeSecurity: false,
  licenseType: "FREE",
};

const setUserAgent = (value: string) => {
  Object.defineProperty(window.navigator, "userAgent", {
    value,
    configurable: true,
  });
};

describe("updateService.getDownloadUrl (desktop)", () => {
  const original = window.navigator.userAgent;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setUserAgent(original);
  });

  it("returns the universal Mac installer for Apple-silicon Macs", () => {
    setUserAgent(
      "Mozilla/5.0 (Macintosh; ARM Mac OS X 14_0) AppleWebKit/605.1.15",
    );
    expect(updateService.getDownloadUrl(stubMachineInfo, true)).toBe(
      DOWNLOAD_URLS.MAC,
    );
  });

  it("returns the universal Mac installer for Intel Macs", () => {
    setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    );
    expect(updateService.getDownloadUrl(stubMachineInfo, true)).toBe(
      DOWNLOAD_URLS.MAC,
    );
  });

  it("returns the universal Mac URL even when the UA misreports Apple-silicon as Intel", () => {
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    const url = updateService.getDownloadUrl(stubMachineInfo, true);
    expect(url).toBe(DOWNLOAD_URLS.MAC);
    expect(url).toContain("Stirling-PDF-macos-universal.dmg");
  });

  it("returns the Windows installer for Windows UAs", () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(updateService.getDownloadUrl(stubMachineInfo, true)).toBe(
      DOWNLOAD_URLS.WINDOWS,
    );
  });

  it("returns a .deb URL for Linux UAs", () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    expect(updateService.getDownloadUrl(stubMachineInfo, true)).toContain(
      "Stirling-PDF-linux-x86_64.deb",
    );
  });

  it("falls back to the GitHub releases page for unknown platforms", () => {
    setUserAgent("Mozilla/5.0 (Unknown OS)");
    expect(updateService.getDownloadUrl(stubMachineInfo, true)).toBe(
      "https://github.com/Stirling-Tools/Stirling-PDF/releases/latest",
    );
  });
});
