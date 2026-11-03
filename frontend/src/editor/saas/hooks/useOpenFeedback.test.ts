import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserbackWidget } from "@userback/widget";

const openFeedbackPage = vi.fn();

vi.mock("@editor-core/hooks/useOpenFeedback", () => ({
  useOpenFeedback: () => openFeedbackPage,
}));

// The token is read at module load, so import only after stubbing it.
async function loadWithToken(token: string) {
  vi.stubEnv("VITE_USERBACK_TOKEN", token);
  const { useOpenFeedback } = await import("@editor/hooks/useOpenFeedback");
  const { setUserbackInstance } =
    await import("@editor/components/feedback/userbackInstance");
  return { useOpenFeedback, setUserbackInstance };
}

describe("useOpenFeedback (saas)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    openFeedbackPage.mockClear();
  });

  it("offers no feedback without a Userback token", async () => {
    const { useOpenFeedback } = await loadWithToken("");
    const { result } = renderHook(() => useOpenFeedback());
    expect(result.current).toBeNull();
  });

  it("opens the feedback page until Userback has loaded", async () => {
    const { useOpenFeedback } = await loadWithToken("token");
    const { result } = renderHook(() => useOpenFeedback());
    expect(result.current).toBe(openFeedbackPage);
  });

  it("opens the Userback form once Userback has loaded", async () => {
    const { useOpenFeedback, setUserbackInstance } =
      await loadWithToken("token");
    const open = vi.fn();
    const { result } = renderHook(() => useOpenFeedback());

    act(() => {
      setUserbackInstance({ open } as unknown as UserbackWidget);
    });
    result.current?.();

    expect(open).toHaveBeenCalledOnce();
    expect(openFeedbackPage).not.toHaveBeenCalled();
  });
});
