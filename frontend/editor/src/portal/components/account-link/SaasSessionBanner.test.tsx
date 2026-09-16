import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { UIProvider, useUI } from "@app/portal/contexts/UIContext";
import { LinkProvider } from "@app/portal/contexts/LinkContext";
import { SaasSessionBanner } from "@app/portal/components/account-link/SaasSessionBanner";

const flags = vi.hoisted(() => ({ isAdmin: true, orgOwner: true }));
vi.mock("@app/auth", () => ({
  useAuth: () => ({
    isAdmin: flags.isAdmin,
    user: { orgOwner: flags.orgOwner },
  }),
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => null,
}));
vi.mock("@app/portal/auth/saasSupabase", () => ({
  ensureSaasSupabase: vi.fn(),
}));
import {
  resetPortalSaasSessionState,
  withPortalSaasSession,
  SaasSessionRequiredError,
} from "@app/portal/auth/portalSaasSession";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
let ui: ReturnType<typeof useUI>;
function Probe() {
  ui = useUI();
  return null;
}
function show(linked = true) {
  return render(
    <MantineProvider>
      <LinkProvider initialState={linked ? "linked-free" : "unlinked"}>
        <UIProvider>
          <Probe />
          <SaasSessionBanner />
        </UIProvider>
      </LinkProvider>
    </MantineProvider>,
  );
}
beforeEach(async () => {
  flags.isAdmin = true;
  flags.orgOwner = true;
  resetPortalSaasSessionState();
  await expect(
    withPortalSaasSession(
      async () => 401,
      (status) => status === 401,
    ),
  ).rejects.toBeInstanceOf(SaasSessionRequiredError);
});
it("opens renewal for a linked owner without changing the device link", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
  expect(ui.linkModalOpen).toBe(true);
  expect(ui.linkModalMode).toBe("reauth");
});
it("does not expose the renewal action to a non-owner", () => {
  flags.isAdmin = false;
  show();
  expect(screen.queryByRole("button")).toBeNull();
});
it("does not ask an unlinked instance to renew a billing session", () => {
  show(false);
  expect(screen.queryByRole("button")).toBeNull();
});

it("removes the renewal prompt when the SDK restores access", () => {
  show();
  expect(screen.getByRole("button", { name: "Sign in again" })).toBeTruthy();
  act(() => window.dispatchEvent(new Event("stirling-saas-session-restored")));
  expect(screen.queryByRole("button", { name: "Sign in again" })).toBeNull();
});

it("keeps one recovery prompt and restores it after the dialog is dismissed", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
  expect(screen.queryByText("Renew billing access")).toBeNull();
  act(() => ui.closeLinkModal());
  expect(screen.getAllByRole("button", { name: "Sign in again" })).toHaveLength(
    1,
  );
});

it("does not show billing renewal to an admin who is not the organization owner", () => {
  flags.orgOwner = false;
  show();
  expect(screen.queryByText("Renew billing access")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});
