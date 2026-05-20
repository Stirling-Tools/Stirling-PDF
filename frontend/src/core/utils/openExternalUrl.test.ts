import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getExternalHref,
  openExternalUrl,
  toSafeExternalUrl,
} from "@app/utils/openExternalUrl";

describe("openExternalUrl utils", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("accepts http/https/mailto URLs", () => {
    expect(toSafeExternalUrl("https://example.com/test")?.href).toBe(
      "https://example.com/test",
    );
    expect(toSafeExternalUrl("http://example.com/test")?.href).toBe(
      "http://example.com/test",
    );
    expect(toSafeExternalUrl("mailto:test@example.com")?.href).toBe(
      "mailto:test@example.com",
    );
  });

  test("rejects unsafe protocols", () => {
    expect(toSafeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(toSafeExternalUrl("file:///etc/passwd")).toBeNull();
    expect(toSafeExternalUrl("ftp://example.com")).toBeNull();
  });

  test("normalizes relative URLs against current origin", () => {
    expect(getExternalHref("/docs/help")?.endsWith("/docs/help")).toBe(true);
  });

  test("openExternalUrl opens safe links and blocks unsafe links", async () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null as Window | null);

    await expect(openExternalUrl("https://example.com")).resolves.toBe(true);
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/",
      "_blank",
      "noopener,noreferrer",
    );

    openSpy.mockClear();

    await expect(openExternalUrl("javascript:alert(1)")).resolves.toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });
});
