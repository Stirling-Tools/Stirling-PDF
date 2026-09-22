import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UIProvider, useUI } from "@app/portal/contexts/UIContext";
import { LinkProvider } from "@app/portal/contexts/LinkContext";
import { ProcurementFlow } from "@app/portal/components/procurement/ProcurementFlow";
import { useProcurement } from "@app/portal/components/procurement/useProcurement";
import { LinkAccountModal } from "@app/portal/components/account-link/LinkAccountModal";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@app/portal/hooks/useLinkedAccountEmail", () => ({
  useLinkedAccountEmail: () => null,
}));
vi.mock("@app/portal/hooks/useConnectHandoff", () => ({
  useConnectHandoff: () => ({ busy: false, error: null, begin: vi.fn() }),
}));
function Flow() {
  const controller = useProcurement();
  const [open, setOpen] = useState(true);
  const ui = useUI();
  return (
    <>
      <ProcurementFlow controller={{ ...controller, open, setOpen }} />
      {ui.linkModalOpen && (
        <LinkAccountModal
          open
          mode={ui.linkModalMode}
          onClose={ui.closeLinkModal}
        />
      )}
    </>
  );
}
it("suspends procurement while connecting and returns to its next action on dismissal", async () => {
  render(
    <MantineProvider>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <LinkProvider initialState="unlinked">
          <UIProvider>
            <Flow />
          </UIProvider>
        </LinkProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "portal.procurement.link.cta" }),
  );
  await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
  expect(
    screen.getByRole("dialog", { name: "Connect your Stirling account" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
  expect(
    screen.getByRole("button", { name: "portal.procurement.link.cta" }),
  ).toBeVisible();
});
