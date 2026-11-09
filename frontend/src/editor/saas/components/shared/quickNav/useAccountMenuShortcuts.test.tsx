import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { TFunction } from "i18next";
import { useAccountMenuShortcuts } from "@editor/components/shared/quickNav/useAccountMenuShortcuts";
import { createSaasConfigNavSections } from "@editor/components/shared/config/saasConfigNavSections";

const auth = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  isAnonymous: false,
}));
const access = vi.hoisted(() => ({ granted: false }));
vi.mock("@editor/auth/UseSession", () => ({ useAuth: () => auth }));
vi.mock("@editor/hooks/usePortalAccess", () => ({
  usePortalAccessState: () => ({ granted: access.granted, settled: true }),
}));
vi.mock("@editor/routes/hasPortal", () => ({ HAS_PORTAL: true }));

const t = ((_key: string, fallback: string) => fallback) as TFunction<
  "translation",
  undefined
>;

function shortcutIds() {
  return renderHook(() => useAccountMenuShortcuts()).result.current.map(
    (s) => s.id,
  );
}

describe("SaaS account menu shortcuts", () => {
  beforeEach(() => {
    auth.user = { id: "u1" };
    auth.isAnonymous = false;
    access.granted = false;
  });

  it("offers team, billing and keys to a signed-in user", () => {
    expect(shortcutIds()).toEqual(["users", "plan", "api-keys"]);
  });

  it("links Usage & Billing instead of Plan for processor members, as settings does", () => {
    access.granted = true;
    expect(shortcutIds()).toEqual(["users", "billing", "api-keys"]);
  });

  it("offers a guest no shortcuts beyond Settings", () => {
    auth.isAnonymous = true;
    expect(shortcutIds()).toEqual([]);
  });

  it("points every shortcut at a section the SaaS settings page really has", () => {
    const keys = new Set(
      createSaasConfigNavSections(() => null, vi.fn(), { t })
        .flatMap((s) => s.items)
        .map((i) => i.key as string),
    );
    const { result } = renderHook(() => useAccountMenuShortcuts());
    for (const shortcut of result.current) {
      const section = shortcut.to.match(/^\/settings\/([^#/]+)/)?.[1];
      expect(keys, shortcut.to).toContain(section);
    }
  });
});
