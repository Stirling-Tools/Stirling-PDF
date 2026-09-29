import { describe, expect, it } from "vitest";
import { isSafePostLoginRedirect } from "@app/services/postLoginRedirect";

// Proprietary override: the core base plus the Spring SSO routes (/oauth2, /saml2).
describe("isSafePostLoginRedirect (proprietary override)", () => {
  it("still accepts ordinary router paths", () => {
    expect(isSafePostLoginRedirect("/editor")).toBe(true);
    expect(isSafePostLoginRedirect("/share/abc123?x=1")).toBe(true);
    expect(isSafePostLoginRedirect("/")).toBe(true);
  });

  it("inherits the base rejections", () => {
    expect(isSafePostLoginRedirect("")).toBe(false);
    expect(isSafePostLoginRedirect(null)).toBe(false);
    expect(isSafePostLoginRedirect("//evil.example")).toBe(false);
    expect(isSafePostLoginRedirect("/\\evil")).toBe(false);
    expect(isSafePostLoginRedirect("/login")).toBe(false);
    expect(isSafePostLoginRedirect("/auth/callback")).toBe(false);
  });

  it("also rejects the Spring SSO routes", () => {
    expect(isSafePostLoginRedirect("/oauth2/authorization/google")).toBe(false);
    expect(isSafePostLoginRedirect("/saml2/authenticate/x")).toBe(false);
  });
});
