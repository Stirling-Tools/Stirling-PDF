import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expect, it, vi } from "vitest";
import type { StirlingFile } from "@app/types/fileContext";

const virtualRows = vi.hoisted(() => vi.fn());
const virtualState = vi.hoisted(() => ({ padTop: 0 }));
const stubs = vi.hoisted(() => [
  { id: "a", name: "a.pdf" } as unknown as StirlingFile,
  { id: "b", name: "b.pdf" } as unknown as StirlingFile,
]);

vi.mock("@app/components/filesPage/useVirtualFileRows", () => ({
  useVirtualFileRows: (...args: unknown[]) => {
    virtualRows(...args);
    return {
      range: { start: 0, end: 3 },
      padTop: virtualState.padTop,
      padBottom: 0,
      columns: 1,
      active: false,
      setContainer: () => {},
    };
  },
}));

vi.mock("@app/contexts/FileContext", () => {
  const selection = { selectedFileIds: [], setSelectedFiles: vi.fn() };
  const state = {
    files: { byId: {}, ids: [] },
    ui: { isProcessing: false },
  };
  const selectors = {
    getStirlingFileStubs: () => stubs,
    getFile: () => null,
  };
  return {
    useFileState: () => ({ state, selectors }),
    useFileManagement: () => ({
      addFiles: vi.fn(),
      removeFiles: vi.fn(),
      reorderFiles: vi.fn(),
    }),
    useFileActions: () => ({
      actions: {
        updateStirlingFileStub: vi.fn(),
        addStirlingFileStubs: vi.fn(),
      },
    }),
    useFileSelection: () => selection,
  };
});
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({ actions: { setWorkbench: vi.fn() } }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ setActiveFileIndex: vi.fn(), setActiveFileId: vi.fn() }),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({ selectedTool: undefined }),
}));
vi.mock("@app/hooks/usePolicyFileBadges", () => ({
  usePolicyFileBadges: () => new Map(),
}));
vi.mock("@app/components/fileEditor/FileEditorThumbnail", () => ({
  default: () => null,
}));
vi.mock("@app/components/fileEditor/AddFileCard", () => ({
  default: () => null,
}));
vi.mock("@app/components/shared/FilePickerModal", () => ({
  default: () => null,
}));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("@app/services/exportWithPolicy", () => ({
  downloadFileWithPolicy: vi.fn(),
}));
vi.mock("@app/services/zipFileService", () => ({ zipFileService: {} }));

import FileEditor from "@app/components/fileEditor/FileEditor";

it("virtualises the grid with the thumbnail card's own row pitch", () => {
  render(
    <MantineProvider>
      <FileEditor />
    </MantineProvider>,
  );

  // 422px card (FileEditorThumbnail.module.css) + the grid's 24px row gap.
  // The shared grid estimate would under-count rows for a scrolled viewport.
  expect(virtualRows).toHaveBeenCalledWith(3, 446, true);
});

it("subtracts the grid's own row gap from the top spacer", () => {
  virtualState.padTop = 446;
  const { container } = render(
    <MantineProvider>
      <FileEditor />
    </MantineProvider>,
  );
  virtualState.padTop = 0;

  // One row above: 446px pitch, minus the 24px gap the grid adds after the
  // spacer, keeps the first rendered row on its virtual offset.
  const spacer = container.querySelector(
    '[aria-hidden="true"][class*="virtualPad"]',
  );
  expect(spacer?.getAttribute("style")).toContain("height: 422px");
});
