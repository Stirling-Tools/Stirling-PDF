import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { AccountLinkNotice } from "@app/components/AccountLinkNotice";
import { baseQueryOptions } from "@app/query/queryClient";
import {
  clearAccountLinkBlock,
  reportFreeTierExhausted,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";

const { alert, begin, auth, get } = vi.hoisted(() => ({
  alert: vi.fn(),
  begin: vi.fn(),
  get: vi.fn(),
  auth: { isAdmin: true, loading: false },
}));
vi.mock("@app/auth", () => ({
  useAuth: () => ({
    ...auth,
    user: { orgOwner: auth.isAdmin },
    loading: false,
  }),
}));
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
      reportFreeTierExhausted();
      reportFreeTierExhausted();
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(alert).not.toHaveBeenCalled();
  });
  it.each(["upload", "export", "manual"] as const)(
    "explains the %s failure and opens that pipeline's settings",
    async (trigger) => {
      mount("/editor");
      await act(async () =>
        reportFreeTierExhausted({
          pipelineId: "rotate-id",
          pipelineName: "Quarterly rotation",

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
      reportFreeTierExhausted({
        pipelineId: "rotate-id",
        pipelineName: "Quarterly rotation",

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
      reportFreeTierExhausted();
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

  describe("administrator ledger", () => {
    afterEach(() => vi.useRealTimers());

    const ledger = (remainingUnits: number) => ({
      data: {
        grantUnits: 500,
        remainingUnits,
        periodEnd: "2026-10-01T00:00:00",
      },
    });

    function BlockProbe() {
      const { exhausted } = useAccountLinkBlock();
      return (
        <output data-testid="block">{exhausted ? "blocked" : "clear"}</output>
      );
    }

    /** The app's own defaults: staleTime decides what a newly shown block trusts. */
    function mountOver(client: QueryClient, onRender?: () => void) {
      const notice = <AccountLinkNotice />;
      return render(
        <QueryClientProvider client={client}>
          <MantineProvider>
            <MemoryRouter initialEntries={["/editor"]}>
              {onRender ? (
                <Profiler id="notice" onRender={onRender}>
                  {notice}
                </Profiler>
              ) : (
                notice
              )}
              <BlockProbe />
            </MemoryRouter>
          </MantineProvider>
        </QueryClientProvider>,
      );
    }

    const appClient = () =>
      new QueryClient({ defaultOptions: { queries: baseQueryOptions } });

    async function settle() {
      for (let i = 0; i < 4; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
      }
    }

    it("lifts the block once the ledger shows room again", async () => {
      get.mockResolvedValue(ledger(120));
      mountOver(appClient());

      await act(async () => reportFreeTierExhausted());

      await waitFor(() =>
        expect(screen.getByTestId("block")).toHaveTextContent("clear"),
      );
    });

    it("keeps the block while the ledger shows nothing left", async () => {
      mountOver(appClient());

      await act(async () => reportFreeTierExhausted());
      await waitFor(() => expect(get).toHaveBeenCalled());
      await act(async () => {});

      expect(screen.getByTestId("block")).toHaveTextContent("blocked");
    });

    /**
     * The modal stays open while the administrator is blocked, and polls the
     * ledger every minute to notice the allowance coming back. A poll that found
     * the same balance used to re-render the whole modal twice.
     */
    it("does not re-render the open modal for a poll that found the same balance", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let commits = 0;
      mountOver(appClient(), () => {
        commits += 1;
      });
      await act(async () => reportFreeTierExhausted());
      await settle();
      const reads = get.mock.calls.length;
      commits = 0;

      for (let i = 0; i < 10; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60_000);
        });
        await settle();
      }

      expect(get.mock.calls.length).toBe(reads + 10);
      expect(commits).toBe(0);
    });

    /**
     * The ledger only runs while a block is up, so when one appears, whatever it
     * has cached was read before it. Lifting on that would override the server's
     * newer answer with an older one.
     */
    it("does not lift a new block with a balance read before it", async () => {
      const client = appClient();
      mountOver(client);

      // First block, then the allowance comes back: the ledger last read 120.
      get.mockResolvedValue(ledger(120));
      await act(async () => reportFreeTierExhausted());
      await waitFor(() =>
        expect(screen.getByTestId("block")).toHaveTextContent("clear"),
      );

      // Moments later a request is refused again, and this time it holds.
      get.mockResolvedValue(ledger(0));
      await act(async () => reportFreeTierExhausted());
      await act(async () => {});
      expect(screen.getByTestId("block")).toHaveTextContent("blocked");

      // And it rests on a read taken after the block, not on the cached one.
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
      await act(async () => {});
      expect(screen.getByTestId("block")).toHaveTextContent("blocked");
    });
  });
});
