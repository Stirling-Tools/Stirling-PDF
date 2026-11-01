import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { LinkProvider } from "@editor/portal/contexts/LinkContext";
import { UIProvider, useUI } from "@editor/portal/contexts/UIContext";
import { LinkAccountFooterItem } from "@editor/portal/components/LinkAccountFooterItem";
const flags = vi.hoisted(() => ({ isAdmin: true, orgOwner: true }));
vi.mock("@editor/auth", () => ({
  useAuth: () => ({ ...flags, user: { orgOwner: flags.orgOwner } }),
}));
vi.mock("@editor/portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({ gated: true, loading: false, connect: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
let ui: ReturnType<typeof useUI>;
function Entries() {
  ui = useUI();
  return <LinkAccountFooterItem />;
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
  flags.orgOwner = true;
  sessionStorage.clear();
});
it("offers the sidebar connection action to the owner", () => {
  show();
  expect(
    screen.getByRole("button", { name: "Link Stirling account" }),
  ).toBeVisible();
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

it("hides the sidebar connection action from ordinary admins", () => {
  flags.orgOwner = false;
  show();
  expect(screen.queryByRole("button")).toBeNull();
});
