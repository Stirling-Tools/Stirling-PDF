import { describe, expect, it } from "vitest";
import { isSafePostLoginRedirect } from "@app/services/postLoginRedirect";

// Core default. Rejects off-origin forms and the auth routes every build has
// (/login, /auth/…); Spring SSO routes are the proprietary override's concern.
describe("isSafePostLoginRedirect (core base)", () => {
  it("accepts same-origin router paths", () => {
    expect(isSafePostLoginRedirect("/editor")).toBe(true);
    expect(isSafePostLoginRedirect("/compress")).toBe(true);
    expect(isSafePostLoginRedirect("/editor?foo=bar")).toBe(true);
    expect(isSafePostLoginRedirect("/oauth/consent?x=1")).toBe(true);
    expect(isSafePostLoginRedirect("/")).toBe(true);
  });

  it("rejects empty and non-string values", () => {
    expect(isSafePostLoginRedirect(null)).toBe(false);
    expect(isSafePostLoginRedirect(undefined)).toBe(false);
    expect(isSafePostLoginRedirect("")).toBe(false);
    expect(isSafePostLoginRedirect(42 as unknown)).toBe(false);
  });

  it("rejects off-origin and protocol-relative forms", () => {
    expect(isSafePostLoginRedirect("//evil.example.com")).toBe(false);
    expect(isSafePostLoginRedirect("/\\evil.example.com")).toBe(false);
    expect(isSafePostLoginRedirect("https://evil.example.com")).toBe(false);
    expect(isSafePostLoginRedirect("editor")).toBe(false);
  });

  it("rejects the universal auth routes so returning back can never loop", () => {
    expect(isSafePostLoginRedirect("/login")).toBe(false);
    expect(isSafePostLoginRedirect("/login?next=%2Feditor")).toBe(false);
    expect(isSafePostLoginRedirect("/auth/callback")).toBe(false);
  });

  it("leaves the Spring SSO routes to the proprietary override", () => {
    expect(isSafePostLoginRedirect("/oauth2/authorize")).toBe(true);
    expect(isSafePostLoginRedirect("/saml2/login")).toBe(true);
  });
});
