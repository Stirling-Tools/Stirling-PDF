import { afterEach, describe, expect, test, vi } from "vitest";
import { openExternalTab } from "@app/platform/openExternalTab";

describe("openExternalTab (core/web)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Opening in a new tab is the point of this seam: @app/platform/openExternal
  // navigates the current tab on saas, which would tear the user out of the PDF.
  test("opens alongside the app rather than navigating it away", async () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null as Window | null);
    const originalHref = window.location.href;

    await openExternalTab("https://example.com/");

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/",
      "_blank",
      "noopener,noreferrer",
    );
    expect(window.location.href).toBe(originalHref);
  });
});
