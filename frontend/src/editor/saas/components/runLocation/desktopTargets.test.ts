import { describe, expect, it } from "vitest";
import { pickDesktopTarget } from "@editor/components/runLocation/desktopTargets";

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const LINUX_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("pickDesktopTarget", () => {
  it("offers the universal Mac build whatever the chip", () => {
    expect(pickDesktopTarget(MAC_UA)).toBe("mac");
    expect(
      pickDesktopTarget(MAC_UA, { platform: "macOS", architecture: "x86" }),
    ).toBe("mac");
    expect(
      pickDesktopTarget(MAC_UA, { platform: "macOS", architecture: "arm" }),
    ).toBe("mac");
  });

  it("picks the Windows build matching the architecture", () => {
    expect(pickDesktopTarget(WINDOWS_UA)).toBe("windowsX64");
    expect(
      pickDesktopTarget(WINDOWS_UA, {
        platform: "Windows",
        architecture: "arm",
      }),
    ).toBe("windowsArm64");
  });

  it("offers the .deb on Linux", () => {
    expect(pickDesktopTarget(LINUX_UA)).toBe("linuxDeb");
  });

  it("sends Arm Linux, which has no build, to the install guide", () => {
    expect(
      pickDesktopTarget(LINUX_UA, { platform: "Linux", architecture: "arm" }),
    ).toBe("linuxArm64");
    expect(
      pickDesktopTarget(
        "Mozilla/5.0 (X11; Linux aarch64; rv:131.0) Gecko/20100101 Firefox/131.0",
      ),
    ).toBe("linuxArm64");
  });

  it("does not mistake Android for desktop Linux", () => {
    expect(pickDesktopTarget(ANDROID_UA)).toBe("mac");
  });
});
