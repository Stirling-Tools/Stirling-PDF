import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserbackWidget } from "@userback/widget";
import { useOpenFeedback } from "@editor/hooks/useOpenFeedback";
import { setUserbackInstance } from "@editor/components/feedback/userbackInstance";

const openFeedbackPage = vi.fn();

vi.mock("@editor-core/hooks/useOpenFeedback", () => ({
  useOpenFeedback: () => openFeedbackPage,
}));

describe("useOpenFeedback (saas)", () => {
  afterEach(() => {
    act(() => {
      setUserbackInstance(null);
    });
    openFeedbackPage.mockClear();
  });

  it("opens the feedback page until Userback has loaded", () => {
    const { result } = renderHook(() => useOpenFeedback());
    expect(result.current).toBe(openFeedbackPage);
  });

  it("opens the Userback form once Userback has loaded", () => {
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
