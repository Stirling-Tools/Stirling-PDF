import { describe, expect, test } from "vitest";
import { getExternalHref, toSafeExternalUrl } from "@app/utils/externalUrl";

describe("externalUrl", () => {
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
    expect(
      toSafeExternalUrl("data:text/html,<script>alert(1)</script>"),
    ).toBeNull();
    expect(toSafeExternalUrl("vbscript:msgbox(1)")).toBeNull();
  });

  test("rejects unparseable input instead of opening it blind", () => {
    expect(toSafeExternalUrl("")).toBeNull();
    expect(toSafeExternalUrl("http://[")).toBeNull();
  });

  test("is not fooled by casing or leading whitespace", () => {
    expect(toSafeExternalUrl("JavaScript:alert(1)")).toBeNull();
    expect(toSafeExternalUrl("  javascript:alert(1)")).toBeNull();
    expect(toSafeExternalUrl("HTTPS://example.com")?.protocol).toBe("https:");
  });

  test("normalizes relative URLs against current origin", () => {
    expect(getExternalHref("/docs/help")?.endsWith("/docs/help")).toBe(true);
  });

  test("getExternalHref returns null for blocked URLs", () => {
    expect(getExternalHref("javascript:alert(1)")).toBeNull();
  });
});
