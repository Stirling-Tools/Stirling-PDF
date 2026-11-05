import { describe, expect, it } from "vitest";
import { DOWNLOAD_URLS } from "@editor/constants/downloads";
import {
  DESKTOP_DOWNLOAD_OPTIONS,
  desktopDownloadForOs,
} from "@editor/components/onboarding/desktopDownloadOptions";

describe("desktopDownloadForOs", () => {
  it("offers the .deb on x64 Linux", () => {
    expect(desktopDownloadForOs("linux-x64").url).toBe(DOWNLOAD_URLS.LINUX_DEB);
  });

  it("sends Arm Linux, which has no build, to the install guide", () => {
    const arm = desktopDownloadForOs("linux-arm64");
    expect(arm.url).toBe(DOWNLOAD_URLS.LINUX_DOCS);
    // The picker names the selected option by URL, so the guide must be one.
    expect(DESKTOP_DOWNLOAD_OPTIONS.map((option) => option.url)).toContain(
      arm.url,
    );
  });
});
