/**
 * Unit tests for buildMobileScannerUrl.
 *
 * Regression guard: the SaaS frontend is served under a base path (e.g.
 * `/app`), and `/mobile-scanner` is a public route that only matches under that
 * base path. The backend advertises `frontendUrl` as a bare origin (no
 * subpath), so the generated QR URL must still carry the base path. Dropping it
 * sent phones to the auth-gated catch-all route / login page.
 */

import { describe, test, expect } from "vitest";
import { buildMobileScannerUrl } from "@app/utils/mobileScannerUrl";

const sessionId = "abc-123";

describe("buildMobileScannerUrl", () => {
  test("origin-only frontendUrl keeps the app base path (SaaS web regression)", () => {
    expect(
      buildMobileScannerUrl({
        configuredUrl: "https://app.stirlingpdf.com",
        sessionId,
        origin: "https://app.stirlingpdf.com",
        basePath: "/app",
      }),
    ).toBe("https://app.stirlingpdf.com/app/mobile-scanner?session=abc-123");
  });

  test("origin-only frontendUrl with a trailing slash keeps the app base path", () => {
    expect(
      buildMobileScannerUrl({
        configuredUrl: "https://app.stirlingpdf.com/",
        sessionId,
        origin: "https://app.stirlingpdf.com",
        basePath: "/app",
      }),
    ).toBe("https://app.stirlingpdf.com/app/mobile-scanner?session=abc-123");
  });

  test("configured URL that already carries the subpath is used verbatim (no doubled base)", () => {
    expect(
      buildMobileScannerUrl({
        configuredUrl: "https://app.stirlingpdf.com/app",
        sessionId,
        origin: "https://elsewhere.example",
        basePath: "/app",
      }),
    ).toBe("https://app.stirlingpdf.com/app/mobile-scanner?session=abc-123");
  });

  test("configured URL subpath with trailing slash is normalized", () => {
    expect(
      buildMobileScannerUrl({
        configuredUrl: "https://host.example/app/",
        sessionId,
        origin: "https://host.example",
        basePath: "",
      }),
    ).toBe("https://host.example/app/mobile-scanner?session=abc-123");
  });

  test("no base path and no configured URL uses the current origin", () => {
    expect(
      buildMobileScannerUrl({
        configuredUrl: "",
        sessionId,
        origin: "http://localhost:5173",
        basePath: "",
      }),
    ).toBe("http://localhost:5173/mobile-scanner?session=abc-123");
  });

  test("empty configured URL falls back to origin + base path", () => {
    expect(
      buildMobileScannerUrl({
        configuredUrl: "   ",
        sessionId,
        origin: "https://app.stirlingpdf.com",
        basePath: "/app",
      }),
    ).toBe("https://app.stirlingpdf.com/app/mobile-scanner?session=abc-123");
  });

  test("custom port (LAN/desktop) is preserved", () => {
    expect(
      buildMobileScannerUrl({
        configuredUrl: "http://192.168.1.50:8080",
        sessionId,
        origin: "http://localhost:8080",
        basePath: "",
      }),
    ).toBe("http://192.168.1.50:8080/mobile-scanner?session=abc-123");
  });

  test("invalid configured URL falls back to the current origin + base path", () => {
    expect(
      buildMobileScannerUrl({
        configuredUrl: "not a url",
        sessionId,
        origin: "https://app.stirlingpdf.com",
        basePath: "/app",
      }),
    ).toBe("https://app.stirlingpdf.com/app/mobile-scanner?session=abc-123");
  });

  test("non-http(s) configured URL is ignored (no javascript: injection)", () => {
    expect(
      buildMobileScannerUrl({
        configuredUrl: "javascript:alert(1)",
        sessionId,
        origin: "https://app.stirlingpdf.com",
        basePath: "/app",
      }),
    ).toBe("https://app.stirlingpdf.com/app/mobile-scanner?session=abc-123");
  });
});
