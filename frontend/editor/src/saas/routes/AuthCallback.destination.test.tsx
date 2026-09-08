import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import AuthCallback from "@app/routes/AuthCallback";
import { supabase } from "@app/auth/supabase";
import {
  rememberPendingDestination,
  resetPendingDestinationForTests,
} from "@app/services/pendingDestination";
import {
  clearPendingConnect,
  rememberPendingConnect,
} from "@app/routes/pendingConnect";

/*
 * Where a completed sign-in lands. The order matters and is easy to break by
 * inserting a branch: a remembered destination is the ONLY thing that survives a
 * sign-up, whose confirmation link is built by Supabase and cannot carry a `next`,
 * so a branch that swallows the no-param case silently strands every buyer who
 * arrived from a link and had to create an account.
 */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@app/utils/loginLanding", () => ({
  resolveLandingPath: vi.fn().mockResolvedValue("/processor"),
}));

async function arriveAtCallback(search = "") {
  window.history.replaceState({}, "", `/auth/callback${search}`);
  render(<AuthCallback />);
  // Real timers and a wait, rather than driving fake ones: the redirect sits behind
  // a 1.5s timeout that is itself only scheduled once the awaited session resolves,
  // and whether a fake-timer sweep sees that timeout depends on how many microtask
  // flushes it happens to perform first.
  await waitFor(() => expect(mockNavigate).toHaveBeenCalled(), {
    timeout: 3000,
  });
}

function landedOn() {
  const call = mockNavigate.mock.calls.at(-1);
  return call?.[0];
}

beforeEach(() => {
  localStorage.clear();
  resetPendingDestinationForTests();
  mockNavigate.mockClear();
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: { user: { id: "u1" } } },
    error: null,
  } as unknown as Awaited<ReturnType<typeof supabase.auth.getSession>>);
});

describe("AuthCallback destination", () => {
  it("prefers an explicit next over anything remembered", async () => {
    rememberPendingDestination("/processor/procurement");
    await arriveAtCallback("?next=%2Fprocessor%2Fusers");
    expect(landedOn()).toBe("/processor/users");
  });

  it("accepts `from`, which the shared 401 handler writes", async () => {
    await arriveAtCallback("?from=%2Fprocessor%2Fusers");
    expect(landedOn()).toBe("/processor/users");
  });

  it("prefers a pending connect request over a remembered destination", async () => {
    rememberPendingConnect("req-1");
    rememberPendingDestination("/processor/procurement");
    await arriveAtCallback();
    expect(landedOn()).toBe("/link?request=req-1");
  });

  // The case a sign-up depends on: nothing in the URL, so storage is all there is.
  it("uses a remembered destination when the URL carries nothing", async () => {
    rememberPendingDestination("/processor/procurement");
    await arriveAtCallback();
    expect(landedOn()).toBe("/processor/procurement");
  });

  it("falls back to the role-based landing when nothing is remembered", async () => {
    await arriveAtCallback();
    expect(landedOn()).toBe("/processor");
  });

  it("refuses an off-origin next and falls back", async () => {
    await arriveAtCallback("?next=%2F%2Fevil.example.com");
    expect(landedOn()).toBe("/processor");
  });

  // A destination is spent by the sign-in it was stored for, even when it loses to a
  // higher-priority source. Left behind it would redirect an unrelated later sign-in.
  it("claims the remembered destination even when an explicit next wins", async () => {
    rememberPendingDestination("/processor/procurement");
    await arriveAtCallback("?next=%2Fprocessor%2Fusers");
    expect(landedOn()).toBe("/processor/users");

    resetPendingDestinationForTests();
    mockNavigate.mockClear();
    await arriveAtCallback();
    expect(landedOn()).toBe("/processor");
  });

  it("claims it even when a pending connect request wins", async () => {
    rememberPendingConnect("req-1");
    rememberPendingDestination("/processor/procurement");
    await arriveAtCallback();
    expect(landedOn()).toBe("/link?request=req-1");

    clearPendingConnect();
    resetPendingDestinationForTests();
    mockNavigate.mockClear();
    await arriveAtCallback();
    expect(landedOn()).toBe("/processor");
  });
});
