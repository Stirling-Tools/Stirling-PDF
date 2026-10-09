import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";
import {
  QuickNavHostProvider,
  useQuickNavHost,
  useRegisterQuickNavView,
} from "@app/contexts/QuickNavHostContext";

/** The Processor entry: in, ask an admin, or (without a connected server) sign in. */
const h = vi.hoisted(() => ({
  connected: true,
  requestProcessorSignup: vi.fn(),
}));
vi.mock("@app/routes/hasPortal", () => ({ HAS_PORTAL: true }));
vi.mock("@app/hooks/useConnectedServer", () => ({
  useConnectedServer: () => h.connected,
}));
vi.mock("@app/services/processorSignup", () => ({
  requestProcessorSignup: h.requestProcessorSignup,
}));
vi.mock("@app/hooks/useProcessingFolderCreation", () => ({
  canCreateProcessingFolders: false,
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/components/shared/quickNav/QuickNavRailContainer", () => ({
  QuickNavRailContainer: ({ groups }: { groups: QuickNavEntry[][] }) => (
    <>
      {groups.flat().map((entry) => (
        <button
          key={entry.id}
          disabled={entry.disabled}
          title={entry.reason}
          onClick={entry.disabled ? undefined : entry.onClick}
        >
          {entry.label}
        </button>
      ))}
    </>
  ),
}));

const NO_ACTIONS = {};

function Account({ portalAccess }: { portalAccess: boolean }) {
  useRegisterQuickNavView({}, NO_ACTIONS);
  const updateAccount = useQuickNavHost()?.updateAccount;
  useEffect(() => {
    updateAccount?.({ accountId: "u-1", isAnonymous: false, portalAccess });
  }, [updateAccount, portalAccess]);
  const { pathname } = useLocation();
  return <output aria-label="Current path">{pathname}</output>;
}

function setup(portalAccess: boolean) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <QuickNavHostProvider>
        <Account portalAccess={portalAccess} />
        <QuickNavRailHost />
      </QuickNavHostProvider>
    </MemoryRouter>,
  );
}

// The test i18n answers with keys.
const processor = () =>
  screen.getByRole("button", { name: "quickNav.processor" });

beforeEach(() => {
  h.connected = true;
  h.requestProcessorSignup.mockClear();
});

it("asks to sign in rather than for an admin when no server is connected", () => {
  h.connected = false;
  setup(false);

  expect(processor()).toBeEnabled();
  fireEvent.click(processor());

  expect(h.requestProcessorSignup).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Current path")).toHaveTextContent("/");
});

it("points a connected account without access at an admin", () => {
  setup(false);

  expect(processor()).toBeDisabled();
  expect(processor()).toHaveAttribute("title", "quickNav.noProcessorAccess");
});

it("goes to the Processor with access", () => {
  setup(true);

  fireEvent.click(processor());

  expect(screen.getByLabelText("Current path")).toHaveTextContent("/processor");
  expect(h.requestProcessorSignup).not.toHaveBeenCalled();
});
