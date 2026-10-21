import { afterEach, describe, expect, test, vi } from "vitest";

const shellOpenMock = vi.fn();

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (url: string) => shellOpenMock(url),
}));

import { openExternalTab } from "@app/platform/openExternalTab";
import { expectConsole } from "@app/tests/failOnConsole";

describe("openExternalTab (desktop/Tauri)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    shellOpenMock.mockReset();
  });

  // Regression for #6272: window.open traps the link inside the Tauri webview,
  // so a PDF link opened a blank in-app window instead of the user's browser.
  test("hands the URL to the OS instead of the webview", async () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null as Window | null);

    await openExternalTab("https://example.com/");

    expect(shellOpenMock).toHaveBeenCalledWith("https://example.com/");
    expect(openSpy).not.toHaveBeenCalled();
  });

  // Worse than the web case: an unvalidated scheme here reaches an OS handler
  // rather than staying inside a browser.
  test.each(["javascript:alert(1)", "file:///etc/passwd", "ftp://example.com"])(
    "refuses to hand %s to the OS",
    async (url) => {
      expectConsole.warn(/Refused to open unsafe URL/);

      await openExternalTab(url);

      expect(shellOpenMock).not.toHaveBeenCalled();
    },
  );
});
