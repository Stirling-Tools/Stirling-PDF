import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import { deriveDisplayName, type User } from "@app/auth/UseSession";

// Stub t() that returns the fallback string passed to it.
const t: TFunction = ((_key: string, fallback?: string) =>
  fallback ?? "") as TFunction;

// Minimal Supabase-shaped User. The real type has many more fields but
// none of them matter for displayName derivation.
function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    email: "alice@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as User;
}

describe("saas deriveDisplayName", () => {
  it("returns null when there is no user object", () => {
    expect(deriveDisplayName(null, t)).toBeNull();
    expect(deriveDisplayName(undefined, t)).toBeNull();
  });

  it("prefers the bridged username over metadata and email", () => {
    expect(
      deriveDisplayName(
        makeUser({
          username: "alice",
          user_metadata: { full_name: "Alice Wonderland" },
          email: "alice@example.com",
        }),
        t,
      ),
    ).toBe("alice");
  });

  it("falls back to user_metadata.full_name when username is missing", () => {
    expect(
      deriveDisplayName(
        makeUser({
          username: undefined,
          user_metadata: { full_name: "Alice Wonderland" },
        }),
        t,
      ),
    ).toBe("Alice Wonderland");
  });

  it("falls back to user_metadata.name when full_name is missing", () => {
    expect(
      deriveDisplayName(
        makeUser({
          username: undefined,
          user_metadata: { name: "Alice" },
        }),
        t,
      ),
    ).toBe("Alice");
  });

  it("falls back to email when no name fields are populated", () => {
    expect(
      deriveDisplayName(
        makeUser({
          username: undefined,
          user_metadata: {},
          email: "alice@example.com",
        }),
        t,
      ),
    ).toBe("alice@example.com");
  });

  it("returns null when nothing identifies the user", () => {
    expect(
      deriveDisplayName(
        makeUser({
          username: undefined,
          user_metadata: {},
          email: undefined,
        }),
        t,
      ),
    ).toBeNull();
  });

  it("returns the localised 'Guest' placeholder for anonymous users", () => {
    expect(
      deriveDisplayName(
        makeUser({
          is_anonymous: true,
          email: "anon@local",
          user_metadata: { full_name: "Whatever" },
        }),
        t,
      ),
    ).toBe("Guest");
  });

  it("treats anonymous flag as authoritative - populated identity fields are ignored", () => {
    // Anonymous Supabase sessions can carry a synthetic email; the UI
    // should still see the placeholder, not the synthetic address.
    expect(
      deriveDisplayName(
        makeUser({
          is_anonymous: true,
          username: "anon-uuid",
        }),
        t,
      ),
    ).toBe("Guest");
  });
});
