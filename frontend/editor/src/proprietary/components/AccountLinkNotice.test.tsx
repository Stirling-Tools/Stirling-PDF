import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { AccountLinkNotice } from "@app/components/AccountLinkNotice";
import {
  clearAccountLinkBlock,
  reportFreeTierExhausted,
} from "@app/services/accountLinkBlock";

const { alert, begin, auth, get } = vi.hoisted(() => ({
  alert: vi.fn(),
  begin: vi.fn(),
  get: vi.fn(),
  auth: { isAdmin: true, loading: false },
}));
vi.mock("@app/auth", () => ({ useAuth: () => auth }));
vi.mock("@app/components/toast", () => ({ alert }));
vi.mock("@app/services/apiClient", () => ({ default: { get } }));
vi.mock("@portal/hooks/useConnectHandoff", () => ({
  useConnectHandoff: () => ({ begin, busy: false, error: null }),
}));
vi.mock("@portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, values?: Record<string, string>) =>
      (fallback ?? key).replace(
        /{{(\w+)}}/g,
        (match, name: string) => values?.[name] ?? match,
      ),
  }),
}));
vi.mock("@app/ui", async () => ({
  ...(await import("@app/ui/Button")),
  ...(await import("@app/ui/Modal")),
  ...(await import("@app/ui/Banner")),
}));

function LocationProbe() {
  return <output>{useLocation().pathname}</output>;
}
function mount(path: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MantineProvider>
        <MemoryRouter initialEntries={[path]}>
          <AccountLinkNotice />
          <LocationProbe />
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("editor shared account-link modal", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAccountLinkBlock();
    vi.clearAllMocks();
    auth.isAdmin = true;
    get.mockResolvedValue({
      data: {
        grantUnits: 500,
        remainingUnits: 0,
        periodEnd: "2026-10-01T00:00:00",
      },
    });
  });
  it.each(["/processor", "/settings/billing", "/settings/account-link"])(
    "leaves %s to its existing link dialog",
    (path) => {
      mount(path);
      act(() => reportFreeTierExhausted());
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(alert).not.toHaveBeenCalled();
    },
  );
  it("opens the administrator modal in the editor and invokes the existing handoff", async () => {
    mount("/editor");
    await act(async () => reportFreeTierExhausted());
    expect(
      screen.getByRole("dialog", { name: "Keep your workflows running" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Add more users with a paid Team plan"),
    ).toBeTruthy();
    expect(screen.queryByText("Active pipelines")).toBeNull();
    expect(get.mock.calls.every(([url]) => !url.includes("/policies"))).toBe(
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Link account for more credits" }),
    );
    expect(begin).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("/editor");
  });
  it("opens once for automatic policy failures", async () => {
    mount("/editor");
    await act(async () => {
      reportFreeTierExhausted("background");
      reportFreeTierExhausted("background");
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(alert).not.toHaveBeenCalled();
  });
  it.each(["upload", "export", "manual"] as const)(
    "explains the %s failure and opens that pipeline's settings",
    async (trigger) => {
      mount("/editor");
      await act(async () =>
        reportFreeTierExhausted("background", {
          pipelineId: "rotate-id",
          pipelineName: "Quarterly rotation",
          fileName: "report.pdf",
          trigger,
        }),
      );
      expect(screen.queryByText(/report\.pdf/)).toBeNull();
      fireEvent.click(screen.getByText("Active pipelines"));
      await screen.findByRole("button", { name: "Open pipeline settings" });
      fireEvent.click(
        screen.getByRole("button", { name: "Open pipeline settings" }),
      );
      expect(screen.getByRole("status").textContent).toBe(
        "/processor/pipelines/rotate-id",
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
  it("gives members the failed pipeline details without an administrator settings action", async () => {
    auth.isAdmin = false;
    mount("/editor");
    await act(async () =>
      reportFreeTierExhausted("background", {
        pipelineId: "rotate-id",
        pipelineName: "Quarterly rotation",
        fileName: "report.pdf",
        trigger: "upload",
      }),
    );
    expect(
      screen.getByText(/Pipeline “Quarterly rotation” stopped after upload/),
    ).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: "Ask your server administrator" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open pipeline settings" }),
    ).toBeNull();
  });
  it("does not replace a dismissed modal with a toast or reopen it on subsequent failures", async () => {
    const view = mount("/editor");
    await act(async () => reportFreeTierExhausted());
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await act(async () => {
      reportFreeTierExhausted();
      reportFreeTierExhausted("background");
    });
    view.unmount();
    mount("/editor");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });
  it("uses the same member modal and never reads the administrator balance", async () => {
    auth.isAdmin = false;
    mount("/editor");
    await act(async () => reportFreeTierExhausted());
    expect(
      screen.getByRole("dialog", { name: "Ask your server administrator" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy message for administrator" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Link account for more credits" }),
    ).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
