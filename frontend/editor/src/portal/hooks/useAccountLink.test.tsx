import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { LinkProvider } from "@portal/contexts/LinkContext";

/**
 * The SSO-return path is mode-aware: a "reauth" return must only refresh the
 * session, NOT re-register the instance (re-registering mints a duplicate device
 * credential). This is the exact regression that slipped through once, so it gets
 * a dedicated guard.
 */
const { linkInstance, fetchStatus, unlinkInstance, getSession } = vi.hoisted(
  () => ({
    linkInstance: vi.fn(),
    fetchStatus: vi.fn(),
    unlinkInstance: vi.fn(),
    getSession: vi.fn(),
  }),
);

vi.mock("@portal/api/link", () => ({
  linkInstance,
  fetchStatus,
  unlinkInstance,
}));
vi.mock("@portal/auth/saasSupabase", () => ({
  PENDING_LINK_KEY: "stirling_pending_link",
  isSaasSupabaseConfigured: true,
  SAAS_OAUTH_PROVIDERS: [],
  ensureSaasSupabase: () => ({ auth: { getSession } }),
}));

import { useAccountLink } from "@portal/hooks/useAccountLink";
import { PENDING_LINK_KEY } from "@portal/auth/saasSupabase";

function Probe() {
  useAccountLink();
  return null;
}

const renderHook = () =>
  render(
    <LinkProvider initialState="linked-free">
      <Probe />
    </LinkProvider>,
  );

beforeEach(() => {
  linkInstance.mockReset().mockResolvedValue({ linked: true, name: null });
  fetchStatus.mockReset().mockResolvedValue({ linked: true, name: null });
  unlinkInstance.mockReset();
  getSession.mockReset().mockResolvedValue({
    data: { session: { access_token: "tok" } },
  });
  sessionStorage.clear();
});
afterEach(() => sessionStorage.clear());

describe("useAccountLink — SSO return", () => {
  it("reauth mode refreshes the session WITHOUT re-registering", async () => {
    sessionStorage.setItem(PENDING_LINK_KEY, "reauth");
    renderHook();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(linkInstance).not.toHaveBeenCalled();
  });

  it("link mode registers the instance with the returned token", async () => {
    sessionStorage.setItem(PENDING_LINK_KEY, "link");
    renderHook();
    await waitFor(() => expect(linkInstance).toHaveBeenCalledTimes(1));
    expect(linkInstance.mock.calls[0][0].supabaseJwt).toBe("tok");
  });
});
