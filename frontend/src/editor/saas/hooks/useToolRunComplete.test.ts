import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToolRunComplete } from "@app/hooks/useToolRunComplete";

const auth = vi.hoisted(() => ({ isAnonymous: true, user: { id: "guest-a" } }));
const signup = vi.hoisted(() => vi.fn());
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => auth }));
vi.mock("@app/services/processorSignup", () => ({
  requestProcessorSignup: signup,
}));

describe("tool completion signup reminders", () => {
  beforeEach(() => {
    localStorage.clear();
    signup.mockClear();
    auth.isAnonymous = true;
    auth.user = { id: "guest-a" };
  });

  it("does not track registered users", () => {
    auth.isAnonymous = false;
    const { result } = renderHook(useToolRunComplete);
    act(() => {
      result.current();
      result.current();
    });
    expect(signup).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("does not prompt when a guest upgrades during a run", () => {
    const { result, rerender } = renderHook(useToolRunComplete);
    const completeInFlight = result.current;
    auth.isAnonymous = false;
    rerender();
    act(() => {
      completeInFlight();
      completeInFlight();
    });
    expect(signup).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("does not attribute an old account's run to a new guest", () => {
    const { result, rerender } = renderHook(useToolRunComplete);
    const completeInFlight = result.current;
    auth.user = { id: "guest-b" };
    rerender();
    act(() => completeInFlight());
    expect(localStorage.length).toBe(0);
  });
});
