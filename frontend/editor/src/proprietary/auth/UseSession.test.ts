import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import type { User } from "@shared/auth/spring/springAuthClient";
import { deriveDisplayName } from "@app/auth/UseSession";

// Stub t() that returns the fallback string. The real i18next instance
// looks up "auth.displayName.user" -> "User" but we don't need that
// machinery here.
const t: TFunction = ((_key: string, fallback?: string) =>
  fallback ?? "") as TFunction;

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "alice@example.com",
    username: "alice",
    role: "USER",
    ...overrides,
  };
}

describe("proprietary deriveDisplayName", () => {
  it("returns null when there is no user object", () => {
    expect(deriveDisplayName(null, t)).toBeNull();
    expect(deriveDisplayName(undefined, t)).toBeNull();
  });

  it("returns the username when present", () => {
    expect(deriveDisplayName(makeUser({ username: "alice" }), t)).toBe("alice");
  });

  it("falls back to email when username is empty", () => {
    expect(
      deriveDisplayName(
        makeUser({ username: "", email: "bob@example.com" }),
        t,
      ),
    ).toBe("bob@example.com");
  });

  it("returns null when both username and email are empty", () => {
    expect(
      deriveDisplayName(makeUser({ username: "", email: "" }), t),
    ).toBeNull();
  });

  it("returns the localised 'User' placeholder for anonymous users", () => {
    expect(
      deriveDisplayName(
        makeUser({ is_anonymous: true, username: "anon-uuid" }),
        t,
      ),
    ).toBe("User");
  });

  it("treats anonymous flag as authoritative - even a populated username is overridden", () => {
    // The Spring backend may assign a generated username to anonymous users;
    // we still want the localised placeholder shown to the UI.
    expect(
      deriveDisplayName(
        makeUser({ is_anonymous: true, username: "anonymous-12345" }),
        t,
      ),
    ).toBe("User");
  });
});
