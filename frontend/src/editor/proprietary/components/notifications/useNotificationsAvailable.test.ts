import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const h = vi.hoisted(() => ({ isAnonymous: false }));

vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => ({ isAnonymous: h.isAnonymous }),
}));

import { useNotificationsAvailable } from "@editor/components/notifications/useNotificationsAvailable";

describe("notification availability — guests", () => {
  it("mounts the bell for an account", () => {
    h.isAnonymous = false;
    const { result } = renderHook(() => useNotificationsAvailable());
    expect(result.current).toBe(true);
  });

  // Every row is scoped to a reader the server knows, and a guest is not one:
  // the bell would poll a route that answers 401 on each tick.
  it("keeps the bell off the rail for a guest", () => {
    h.isAnonymous = true;
    const { result } = renderHook(() => useNotificationsAvailable());
    expect(result.current).toBe(false);
  });
});
