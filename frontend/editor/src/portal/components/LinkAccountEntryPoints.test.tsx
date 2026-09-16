import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { LinkProvider } from "@app/portal/contexts/LinkContext";
import { UIProvider, useUI } from "@app/portal/contexts/UIContext";
import { ConnectAccountRail } from "@app/portal/components/ConnectAccountRail";
import { LinkAccountFooterItem } from "@app/portal/components/LinkAccountFooterItem";
const flags = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("@app/auth", () => ({ useAuth: () => flags }));
vi.mock("@app/portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({ gated: true, loading: false, connect: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
let ui: ReturnType<typeof useUI>;
function Entries() {
  ui = useUI();
  return (
    <>
      <ConnectAccountRail />
      <LinkAccountFooterItem />
    </>
  );
}
function show() {
  render(
    <MantineProvider>
      <LinkProvider initialState="unlinked">
        <UIProvider>
          <Entries />
        </UIProvider>
      </LinkProvider>
    </MantineProvider>,
  );
}
beforeEach(() => {
  flags.isAdmin = true;
  sessionStorage.clear();
});
it("offers the connection shortcuts to the owner", () => {
  show();
  expect(screen.getByRole("button", { name: /^Connect$/ })).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Link Stirling account" }),
  );
  expect(ui.linkModalOpen).toBe(true);
});
it("does not offer owner-only connection actions to other processor users", () => {
  flags.isAdmin = false;
  show();
  expect(screen.queryByRole("button")).toBeNull();
});
