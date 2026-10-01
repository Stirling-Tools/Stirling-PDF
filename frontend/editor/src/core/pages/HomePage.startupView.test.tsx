import "fake-indexeddb/auto";
import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { AppProviders } from "@app/components/AppProviders";
import HomePage from "@app/pages/HomePage";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  useNavigationActions,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import NavigationWarningModal from "@app/components/shared/NavigationWarningModal";
import { QuickNavHostProvider } from "@app/contexts/QuickNavHostContext";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import { allowConsole } from "@app/tests/failOnConsole";
import type { ToolId } from "@app/types/toolId";

vi.mock("@app/hooks/useDocumentMeta", () => ({ useDocumentMeta: () => {} }));

const seen = { pathname: "", readerMode: false };
let showPage: () => void = () => {};
let backToTools: () => void = () => {};
let selectTool: (id: ToolId) => void = () => {};
let goBack: () => void = () => {};
let setReaderMode: (on: boolean) => void = () => {};
let navigation: ReturnType<typeof useNavigationState>;
let navigationActions: ReturnType<typeof useNavigationActions>["actions"];

function Probe() {
  seen.pathname = useLocation().pathname;
  const navigate = useNavigate();
  const workflow = useToolWorkflow();
  navigation = useNavigationState();
  navigationActions = useNavigationActions().actions;
  seen.readerMode = workflow.readerMode;
  backToTools = workflow.handleBackToTools;
  selectTool = workflow.handleToolSelect;
  setReaderMode = workflow.setReaderMode;
  goBack = () => navigate(-1);
  return null;
}

// Holds the page back behind already-mounted providers, as the desktop shell
// does until its auth check settles.
function Page({ late }: { late: boolean }) {
  const [shown, setShown] = useState(!late);
  showPage = () => setShown(true);
  return (
    <>
      <Probe />
      <NavigationWarningModal />
      {shown && <HomePage />}
    </>
  );
}

function renderApp(late = false) {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <MantineProvider>
        <QuickNavHostProvider>
          <QuickNavRailHost />
          <AppProviders
            appConfigProviderProps={{
              initialConfig: {},
              bootstrapMode: "non-blocking",
              autoFetch: false,
            }}
          >
            <Page late={late} />
          </AppProviders>
        </QuickNavHostProvider>
      </MantineProvider>
    </MemoryRouter>,
  );
}

async function expectSettledInReader() {
  await waitFor(() => expect(seen.pathname).toBe("/reader"));
  // Settled there, not just passing through on the way back to the editor.
  await act(() => new Promise((r) => setTimeout(r, 1000)));
  expect(seen).toEqual({ pathname: "/reader", readerMode: true });
}

describe("default startup view: Reader", () => {
  beforeEach(() => {
    // The full provider tree settles asynchronously outside act().
    allowConsole.error(/not wrapped in act/);
    localStorage.clear();
    localStorage.setItem(
      "stirlingpdf_preferences",
      JSON.stringify({ defaultStartupView: "read" }),
    );
  });

  it.each([
    ["with the providers", false],
    ["after the providers", true],
  ])("opens reading when the page mounts %s", async (_label, late) => {
    renderApp(late);
    if (late) {
      await waitFor(() => expect(seen.readerMode).toBe(true));
      act(() => showPage());
    }
    await expectSettledInReader();
  });

  it("keeps the editor on a reload", async () => {
    const navigation = vi
      .spyOn(performance, "getEntriesByType")
      .mockReturnValue([{ type: "reload" } as PerformanceNavigationTiming]);
    renderApp();
    await act(() => new Promise((r) => setTimeout(r, 1500)));
    expect(seen).toEqual({ pathname: "/", readerMode: false });
    navigation.mockRestore();
  });

  it("returns to reading from the brand mark", async () => {
    renderApp();
    await expectSettledInReader();
    act(() => backToTools());
    await waitFor(() =>
      expect(seen).toEqual({ pathname: "/", readerMode: false }),
    );
    fireEvent.click(document.querySelector(".quick-nav-brand-button")!);
    await expectSettledInReader();
  }, 15000);

  it("returns to reading from a selected tool and Back reopens that tool", async () => {
    renderApp();
    await expectSettledInReader();
    act(() => selectTool("compress"));
    await waitFor(() =>
      expect(seen).toEqual({ pathname: "/compress", readerMode: false }),
    );

    fireEvent.click(document.querySelector(".quick-nav-brand-button")!);
    await expectSettledInReader();

    act(() => goBack());
    await waitFor(() =>
      expect(seen).toEqual({ pathname: "/compress", readerMode: false }),
    );
  }, 15000);

  it("opens reading from the rail while a tool is open", async () => {
    renderApp();
    await expectSettledInReader();
    act(() => selectTool("compress"));
    await waitFor(() =>
      expect(seen).toEqual({ pathname: "/compress", readerMode: false }),
    );

    act(() => setReaderMode(true));
    await expectSettledInReader();
  }, 15000);

  it.each([
    ["cancel", "state"],
    ["discard", "state"],
    ["cancel", "checker"],
    ["discard", "checker"],
  ])(
    "waits for the unsaved-changes decision from the brand mark: %s (%s)",
    async (decision, dirtySource) => {
      renderApp();
      await expectSettledInReader();
      act(() => selectTool("multiTool"));
      await waitFor(() => {
        expect(seen).toEqual({ pathname: "/multi-tool", readerMode: false });
        expect(navigation.workbench).toBe("pageEditor");
      });
      if (dirtySource === "checker") {
        let dirty = true;
        act(() => {
          navigationActions.registerUnsavedChangesChecker(() => dirty);
          navigationActions.registerNavigationWarningHandlers({
            onDiscardAndContinue: async () => {
              dirty = false;
            },
          });
        });
      } else {
        act(() => navigationActions.setHasUnsavedChanges(true));
      }

      fireEvent.click(document.querySelector(".quick-nav-brand-button")!);
      await waitFor(() => expect(navigation.showNavigationWarning).toBe(true));
      expect(seen).toEqual({ pathname: "/multi-tool", readerMode: false });
      expect(navigation.selectedTool).toBe("multiTool");
      expect(navigation.workbench).toBe("pageEditor");

      if (decision === "cancel") {
        fireEvent.click(screen.getByRole("button", { name: "keepWorking" }));
        await waitFor(() =>
          expect(navigation.showNavigationWarning).toBe(false),
        );
        expect(seen).toEqual({ pathname: "/multi-tool", readerMode: false });
        expect(navigation.selectedTool).toBe("multiTool");
        expect(navigation.workbench).toBe("pageEditor");
        expect(navigation.hasUnsavedChanges).toBe(true);
      } else {
        fireEvent.click(screen.getByTestId("unsaved-discard"));
        await expectSettledInReader();
        expect(navigation.workbench).toBe("viewer");
        expect(navigation.selectedTool).toBeNull();
        expect(navigation.hasUnsavedChanges).toBe(false);
        expect(navigation.showNavigationWarning).toBe(false);
        expect(navigation.pendingNavigation).toBeNull();
      }
    },
    15000,
  );
});
