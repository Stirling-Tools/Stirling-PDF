import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchBarButtonWithAction } from "@editor/hooks/useWorkbenchBarButtons";
import { useViewerWorkbenchBarButtons } from "@editor/components/viewer/useViewerWorkbenchBarButtons";

const state = vi.hoisted(() => ({
  registered: [] as WorkbenchBarButtonWithAction[],
  known: new Set<string>(),
  opened: new Set<string>(),
}));

vi.mock("@editor/hooks/useWorkbenchBarButtons", () => ({
  useWorkbenchBarButtons: (buttons: WorkbenchBarButtonWithAction[]) => {
    state.registered = buttons;
  },
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({
    activeFileId: "file-1",
    isThumbnailSidebarVisible: false,
    isBookmarkSidebarVisible: false,
    isAttachmentSidebarVisible: false,
    isLayerSidebarVisible: false,
    hasLayers: false,
    isCommentsSidebarVisible: false,
    toggleCommentsSidebar: vi.fn(),
    isSearchInterfaceVisible: false,
    registerImmediatePanUpdate: () => () => undefined,
    panActions: { disablePan: vi.fn() },
  }),
}));
vi.mock("@editor/hooks/usePdfAccess", () => ({
  usePdfAccess: () => null,
}));
vi.mock("@editor/services/rightsManagedPdf", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/rightsManagedPdf")
  >()),
  isKnownRightsManagedPdf: (fileId: string) => state.known.has(fileId),
  getOpenedRightsManagedPdf: (fileId: string) =>
    state.opened.has(fileId) ? {} : undefined,
}));
vi.mock("@editor/contexts/SidebarContext", () => ({
  useSidebarContext: () => ({ sidebarRefs: {} }),
}));
vi.mock("@editor/hooks/useWorkbenchBarTooltipSide", () => ({
  useWorkbenchBarTooltipSide: () => ({ position: "left" }),
}));
vi.mock("@editor/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    handleToolSelect: vi.fn(),
    handleToolSelectForced: vi.fn(),
    handleBackToTools: vi.fn(),
  }),
}));
vi.mock("@editor/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ selectedTool: null }),
  useNavigationGuard: () => ({ requestNavigation: vi.fn() }),
}));
vi.mock("@editor/contexts/RedactionContext", () => ({
  useRedaction: () => ({ redactionsApplied: false, activeType: null }),
  useRedactionMode: () => ({ pendingCount: 0 }),
}));
vi.mock("@editor/components/viewer/useViewerReadAloud", () => ({
  useViewerReadAloud: () => ({
    isReadingAloud: false,
    speechRate: 1,
    speechLanguage: "en-US",
    speechVoice: null,
    supportedLanguageCodes: new Set<string>(),
    handleReadAloud: vi.fn(),
    handleSpeechRateChange: vi.fn(),
    handleSpeechLanguageChange: vi.fn(),
  }),
}));

beforeEach(() => {
  state.registered = [];
  state.known.clear();
  state.opened.clear();
});

describe("useViewerWorkbenchBarButtons", () => {
  it("disables every viewer control while a Purview file is still locked", () => {
    state.known.add("file-1");
    renderHook(() => useViewerWorkbenchBarButtons());
    expect(state.registered.length).toBeGreaterThan(0);
    expect(state.registered.every((button) => button.disabled)).toBe(true);
  });

  it("enables the controls once the Purview file is opened", () => {
    state.known.add("file-1");
    state.opened.add("file-1");
    renderHook(() => useViewerWorkbenchBarButtons());
    expect(state.registered.some((button) => button.disabled)).toBe(false);
  });
});
