import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useAutoAnonymousAuth } from "@app/hooks/useAutoAnonymousAuth";
import { expectConsole } from "@app/tests/failOnConsole";

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ session: null, loading: false }),
}));
vi.mock("@app/auth/supabase", () => ({
  signInAnonymously: signIn,
  supabase: {},
}));

describe("public editor guest access", () => {
  it("attempts guest access on /editor and stops retrying when authentication fails", async () => {
    signIn.mockResolvedValue({ error: new Error("Guest access unavailable") });
    expectConsole.error(/anonymous auth failed/);
    const { result, rerender } = renderHook(() => useAutoAnonymousAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/editor"]}>{children}</MemoryRouter>
      ),
    });
    await waitFor(() =>
      expect(result.current.autoAuthError).toBe("Guest access unavailable"),
    );
    rerender();
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(result.current.isAutoAuthenticating).toBe(false);
  });
});
