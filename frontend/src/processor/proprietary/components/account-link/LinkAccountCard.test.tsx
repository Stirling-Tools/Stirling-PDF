import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PortalTestProviders } from "@processor/test/TestQueryProvider";
import { LinkAccountCard } from "@processor/components/account-link/LinkAccountCard";
import type { UseAccountLink } from "@processor/hooks/useAccountLink";

const { auth, openLinkModal, unlink } = vi.hoisted(() => ({
  auth: { user: { orgOwner: false } },
  openLinkModal: vi.fn(),
  unlink: vi.fn(),
}));
vi.mock("@editor/auth/context", () => ({ useAuth: () => auth }));
vi.mock("@processor/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal }),
}));

vi.mock("@processor/hooks/useLinkedAccountEmail", () => ({
  useLinkedAccountEmail: () => null,
}));

const link: UseAccountLink = {
  loginConfigured: true,
  status: { linked: false, name: null },
  statusError: null,
  phase: "idle",
  error: null,
  unlink,
  refresh: async () => {},
};

describe("account-link ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user.orgOwner = false;
  });

  it.each([false, true])(
    "keeps link changes unavailable to another admin when linked=%s",
    (linked) => {
      render(
        <PortalTestProviders>
          <LinkAccountCard link={{ ...link, status: { linked, name: null } }} />
        </PortalTestProviders>,
      );
      const action = screen.getByRole("button", {
        name: linked
          ? "Disconnect this instance"
          : "Connect your Stirling account",
      });
      expect(action).toBeDisabled();
      fireEvent.click(action);
      expect(unlink).not.toHaveBeenCalled();
      expect(openLinkModal).not.toHaveBeenCalled();
      expect(
        screen.getByText("Only the org owner can link or unlink this server."),
      ).toBeInTheDocument();
    },
  );

  it.each([false, true])(
    "gives the new owner link control when linked=%s",
    (linked) => {
      auth.user.orgOwner = true;
      render(
        <PortalTestProviders>
          <LinkAccountCard link={{ ...link, status: { linked, name: null } }} />
        </PortalTestProviders>,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: linked
            ? "Disconnect this instance"
            : "Connect your Stirling account",
        }),
      );
      if (linked) {
        expect(unlink).not.toHaveBeenCalled();
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", {
            name: "Disconnect this instance",
          }),
        );
      }
      expect(linked ? unlink : openLinkModal).toHaveBeenCalledTimes(1);
    },
  );
});
