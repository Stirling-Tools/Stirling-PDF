import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expect, it, vi } from "vitest";
import type { StirlingFile } from "@app/types/fileContext";

const virtualRows = vi.hoisted(() => vi.fn());
const stubs = vi.hoisted(() => [
  { id: "a", name: "a.pdf" } as unknown as StirlingFile,
  { id: "b", name: "b.pdf" } as unknown as StirlingFile,
]);

vi.mock("@app/components/filesPage/useVirtualFileRows", () => ({
  useVirtualFileRows: (...args: unknown[]) => {
    virtualRows(...args);
    return {
      range: { start: 0, end: 3 },
      padTop: 0,
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
