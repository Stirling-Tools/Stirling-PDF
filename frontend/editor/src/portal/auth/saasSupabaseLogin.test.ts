import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the shared Supabase client the in-app link login is wired to. Declared
// via vi.hoisted so the vi.mock factory can reference them.
const { signInWithPassword, signInWithOAuth } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock("@shared/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => ({ auth: { signInWithPassword, signInWithOAuth } }),
}));

import { useSupabaseLogin } from "@shared/auth/ui/useSupabaseLogin";

describe("useSupabaseLogin (in-app account-link login)", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    signInWithOAuth.mockReset();
  });

  it("fires onSuccess with the access token on a successful email sign-in", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "tok-123" } },
      error: null,
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useSupabaseLogin({ onSuccess }));

    act(() => {
      result.current.setEmail("admin@org.com");
      result.current.setPassword("pw");
    });
    await act(async () => {
      await result.current.signInWithEmail();
    });

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "admin@org.com",
      password: "pw",
    });
    expect(onSuccess).toHaveBeenCalledWith({ access_token: "tok-123" });
    expect(result.current.error).toBeNull();
  });

  it("surfaces an email sign-in error and skips onSuccess", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useSupabaseLogin({ onSuccess }));

    act(() => {
      result.current.setEmail("admin@org.com");
      result.current.setPassword("nope");
    });
    await act(async () => {
      await result.current.signInWithEmail();
    });

    expect(result.current.error).toBe("Invalid login credentials");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("kicks off OAuth with the provider, redirect, and pre-redirect hook", async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    const onBeforeOAuth = vi.fn();
    const { result } = renderHook(() =>
      useSupabaseLogin({
        providers: ["google", "github"],
        redirectTo: "http://portal.local/account-link",
        onBeforeOAuth,
      }),
    );

    expect(result.current.hasProviders).toBe(true);
    await act(async () => {
      await result.current.signInWithProvider("google");
    });

    expect(onBeforeOAuth).toHaveBeenCalledWith("google");
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://portal.local/account-link" },
    });
  });

  it("validates both fields before calling Supabase", async () => {
    const { result } = renderHook(() => useSupabaseLogin());
    await act(async () => {
      await result.current.signInWithEmail();
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });
});
