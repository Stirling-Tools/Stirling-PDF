import { useEffect, useState, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import HomePage from "@app/pages/HomePage";

const state = vi.hoisted(() => ({
  mobile: false,
  workbench: "signing",
  mounted: vi.fn(),
  unmounted: vi.fn(),
  actions: {
    viewDerivedFromPathRef: { current: "/shared-sign" },
    setWorkbench: vi.fn(),
    setToolAndWorkbench: vi.fn(),
  },
  workflow: {
    selectedTool: null,
    selectedToolKey: null,
    readerMode: false,
    setReaderMode: vi.fn(),
    setLeftPanelView: vi.fn(),
    handleToolSelect: vi.fn(),
    handleBackToTools: vi.fn(),
    toolAvailability: {},
    customWorkbenchViews: [],
    toolRegistry: {},
  },
}));

vi.mock("@app/hooks/useIsMobile", () => ({
  useIsMobile: () => state.mobile,
  useIsTouch: () => false,
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => state.workflow,
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ workbench: state.workbench }),
  useNavigationActions: () => ({ actions: state.actions }),
  useNavigationGuard: () => ({ requestNavigation: vi.fn() }),
}));
vi.mock("@app/contexts/SidebarContext", () => ({
  useSidebarContext: () => ({ sidebarRefs: {} }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: {} }),
}));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: { defaultStartupView: "tools" } }),
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileContext: () => ({ activeFiles: [] }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    searchInterfaceActions: {},
    setActiveFileIndex: vi.fn(),
  }),
}));
vi.mock("@app/contexts/TitleBarStripContext", () => ({
  useTitleBarStrip: () => ({ enabled: false }),
}));
vi.mock("@app/contexts/QuickNavHostContext", () => ({
  useQuickNavHost: () => null,
}));
vi.mock("@app/hooks/useDocumentMeta", () => ({ useDocumentMeta: vi.fn() }));
vi.mock("@app/hooks/useBaseUrl", () => ({
  useBaseUrl: () => "http://localhost",
}));
vi.mock("@app/hooks/signing/useOpenSigning", () => ({
  useOpenSigning: vi.fn(),
}));
vi.mock("@app/hooks/useProcessingFolderCreation", () => ({
  useProcessingFolderCreation: () => ({ dialog: null }),
}));
vi.mock("@app/components/policies/usePoliciesEnabled", () => ({
  usePoliciesEnabled: () => false,
}));
vi.mock("@app/components/policies/PolicyAutoRunController", () => ({
  PolicyAutoRunController: () => null,
}));
vi.mock("@app/components/shared/quickNav/QuickNavHostBridge", () => ({
  QuickNavHostBridge: () => null,
}));
vi.mock("@app/components/shared/signing/SignMenu", () => ({
  SignMenu: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/components/home/HomePageExtensions", () => ({
  HomePageExtensions: () => null,
}));
vi.mock("@app/components/FileManager", () => ({ default: () => null }));
vi.mock("@app/components/shared/FileSidebar", () => ({ default: () => null }));
vi.mock("@app/components/shared/MobileUploadModal", () => ({
  default: () => null,
}));
vi.mock("@app/components/viewer/readerRail/ReaderRail", () => ({
  ReaderRail: () => null,
}));
vi.mock("@app/components/viewer/readerRail/ReaderSuperSearch", () => ({
  ReaderSuperSearch: () => null,
}));
vi.mock("@app/components/tools/RightSidebar", () => ({
  default: () => <aside aria-label="Tool panel" />,
}));
vi.mock("@app/contexts/FilesPageContext", () => ({
  FilesPageProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/components/layout/Workbench", () => ({
  default: function StatefulWorkbench() {
    const [view, setView] = useState("Signing sessions");
    const [draft, setDraft] = useState("");
    useEffect(() => {
      state.mounted();
      return () => state.unmounted();
    }, []);
    return (
      <main aria-label="Workbench">
        <h1>{view}</h1>
        <button onClick={() => setView("Request signatures")}>
          New request
        </button>
        <input
          aria-label="Draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </main>
    );
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.mobile = false;
  state.workbench = "signing";
  state.actions.viewDerivedFromPathRef.current = "/shared-sign";
});

function Page() {
  return (
    <MemoryRouter initialEntries={["/shared-sign"]}>
      <MantineProvider env="test">
        <HomePage />
      </MantineProvider>
    </MemoryRouter>
  );
}

it.each([false, true])(
  "preserves signing view and draft across repeated breakpoint changes (starts mobile: %s)",
  async (startsMobile) => {
    state.mobile = startsMobile;
    const user = userEvent.setup();
    const { rerender } = render(<Page />);
    await user.click(screen.getByRole("button", { name: "New request" }));
    await user.type(
      screen.getByRole("textbox", { name: "Draft" }),
      "Unsaved request",
    );
    const workbench = screen.getByRole("main", { name: "Workbench" });

    for (const mobile of [!startsMobile, startsMobile, !startsMobile]) {
      state.mobile = mobile;
      rerender(<Page />);
      expect(
        screen.getByRole("heading", { name: "Request signatures" }),
      ).toBeVisible();
      expect(screen.getByRole("textbox", { name: "Draft" })).toHaveValue(
        "Unsaved request",
      );
      expect(screen.getByRole("main", { name: "Workbench" })).toBe(workbench);
      expect(screen.getAllByRole("main", { name: "Workbench" })).toHaveLength(
        1,
      );
      expect(
        screen.queryByRole("button", { name: "signMenu.title" }) !== null,
      ).toBe(mobile);
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("complementary", { name: "Tool panel" }),
      ).not.toBeInTheDocument();
    }
    expect(state.mounted).toHaveBeenCalledTimes(1);
    expect(state.unmounted).not.toHaveBeenCalled();
  },
);
