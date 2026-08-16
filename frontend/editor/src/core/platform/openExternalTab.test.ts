import { afterEach, describe, expect, test, vi } from "vitest";
import { openExternalTab } from "@app/platform/openExternalTab";
import { expectConsole } from "@app/tests/failOnConsole";

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

  // The seam is the sink, so it must not depend on callers having sanitised:
  // window.open on a javascript: URL would execute it in our own origin.
  test.each([
    "javascript:alert(1)",
    "  javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
  ])("refuses to open %s even if a caller skips sanitising", async (url) => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null as Window | null);
    expectConsole.warn(/Refused to open unsafe URL/);

    await openExternalTab(url);

    expect(openSpy).not.toHaveBeenCalled();
  });
});
