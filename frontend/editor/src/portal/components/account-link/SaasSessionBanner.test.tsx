import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { SaasSessionBanner } from "@portal/components/account-link/SaasSessionBanner";

const flags = vi.hoisted(() => ({ isAdmin: true, required: true }));
vi.mock("@app/auth", () => ({ useAuth: () => ({ isAdmin: flags.isAdmin }) }));
vi.mock("@portal/hooks/usePortalSaasSession", () => ({
  usePortalSaasSession: () => ({ required: flags.required }),
}));
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
beforeEach(() => {
  flags.isAdmin = true;
  flags.required = true;
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
