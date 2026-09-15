import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type EmailSession = { user: { email: string } } | null;
const state = vi.hoisted(() => ({
  configured: true,
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as ((event: string, session: EmailSession) => void) | null,
}));
vi.mock("@portal/auth/saasSupabase", () => ({
  ensureSaasSupabase: () =>
    state.configured
      ? {
          auth: {
            getSession: state.getSession,
            onAuthStateChange: (
              callback: NonNullable<typeof state.listener>,
            ) => {
              state.listener = callback;
              return {
                data: { subscription: { unsubscribe: state.unsubscribe } },
              };
            },
          },
        }
      : null,
}));

import { useLinkedAccountEmail } from "@portal/hooks/useLinkedAccountEmail";

describe("Current SaaS email", () => {
  beforeEach(() => {
    state.configured = true;
    state.listener = null;
    state.unsubscribe.mockReset();
    state.getSession.mockReset().mockResolvedValue({
      data: { session: { user: { email: "owner@example.com" } } },
    });
  });

  it("follows account changes and sign-out while the page stays open", async () => {
    const { result, unmount } = renderHook(useLinkedAccountEmail);
    await waitFor(() => expect(result.current).toBe("owner@example.com"));
    act(() =>
      state.listener?.("SIGNED_IN", { user: { email: "other@example.com" } }),
    );
    expect(result.current).toBe("other@example.com");
    act(() => state.listener?.("SIGNED_OUT", null));
    expect(result.current).toBeNull();
    unmount();
    expect(state.unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not restore an old email when a pending read finishes after sign-out", async () => {
    let finishRead: (value: {
      data: { session: EmailSession };
    }) => void = () => {};
    state.getSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );
    const { result } = renderHook(useLinkedAccountEmail);
    act(() => state.listener?.("SIGNED_OUT", null));
    await act(async () =>
      finishRead({ data: { session: { user: { email: "old@example.com" } } } }),
    );
    expect(result.current).toBeNull();
  });

  it("leaves the email unavailable if the session read fails", async () => {
    state.getSession.mockRejectedValue(new Error("Session unavailable"));
    const { result } = await act(async () => renderHook(useLinkedAccountEmail));
    expect(result.current).toBeNull();
  });

  it("does not query an unconfigured SaaS client", () => {
    state.configured = false;
    const { result } = renderHook(useLinkedAccountEmail);
    expect(result.current).toBeNull();
    expect(state.getSession).not.toHaveBeenCalled();
  });
});
