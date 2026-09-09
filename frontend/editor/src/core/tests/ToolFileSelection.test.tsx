import { createContext, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import Compress from "@app/tools/Compress";
import Convert from "@app/tools/Convert";
import Merge from "@app/tools/Merge";
import ScannerImageSplit from "@app/tools/ScannerImageSplit";
import ConvertToPdfUaSettings from "@app/components/tools/convert/ConvertToPdfUaSettings";
import type { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import type { ToolAutomationSettingsProps } from "@app/hooks/tools/shared/toolOperationTypes";
import {
  createNewStirlingFileStub,
  createStirlingFile,
  type StirlingFile,
  type StirlingFileStub,
} from "@app/types/fileContext";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";
import {
  ToolFileEligibilityProvider,
  useToolEligibleFileIds,
} from "@app/contexts/ToolFileEligibilityContext";
import { FileItem } from "@app/components/shared/FileSidebarFileItem";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useCompressOperation } from "@app/hooks/tools/compress/useCompressOperation";
import { defaultParameters as compressParameters } from "@app/hooks/tools/compress/useCompressParameters";

const workspace = {
  files: [] as StirlingFile[],
  fileStubs: [] as StirlingFileStub[],
};
const viewer = { activeFileIndex: 0 };
const navigation = { workbench: "fileEditor" };
const selectors = {
  getStirlingFileStub: (id: string) =>
    workspace.fileStubs.find((stub) => stub.id === id),
};
const loadRecentFiles = vi.fn().mockResolvedValue([]);
const onFileClick = vi.fn();
const onPreviewRender = vi.fn();

const pdfWorker = vi.hoisted(() => ({
  createDocument: vi.fn(),
  destroyDocument: vi.fn(),
}));

function FilePreviews() {
  const eligibleFileIds = useToolEligibleFileIds();
  onPreviewRender();
  return workspace.files.map((file) => (
    <FileItem
      key={file.fileId}
      fileId={file.fileId}
      name={file.name}
      isSelected
      isActive={false}
      isViewedInViewer={false}
      isToolSkipped={
        eligibleFileIds !== null && !eligibleFileIds.has(file.fileId)
      }
      onClick={onFileClick}
      onEyeClick={vi.fn()}
    />
  ));
}

function EmptyFileSelectionTool({ filesVisible }: { filesVisible: boolean }) {
  const operation = useCompressOperation();
  return createToolFlow({
    files: { selectedFiles: [], isVisible: filesVisible },
    steps: [],
    review: { isVisible: false, operation, title: "Results" },
  });
}

vi.mock("@app/hooks/useLazyThumbnail", () => ({
  useLazyThumbnail: () => undefined,
}));

vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({
    ...workspace,
    fileIds: workspace.files.map((file) => file.fileId),
  }),
  useFileContext: () => ({ selectors, actions: {} }),
  useFileSelectors: () => selectors,
  useFileActions: () => ({ actions: {} }),
  useFileSelection: () => ({ setSelectedFiles: vi.fn() }),
  useFileManagement: () => ({ reorderFiles: vi.fn() }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  ViewerContext: createContext(null),
  useViewer: () => viewer,
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => navigation,
  useNavigationActions: () => ({ actions: {} }),
}));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: {} }),
}));
vi.mock("@app/contexts/FilesModalContext", () => ({
  useFilesModalContext: () => ({}),
}));
vi.mock("@app/hooks/useFileManager", () => ({
  useFileManager: () => ({ loadRecentFiles }),
}));
vi.mock("@app/hooks/useEndpointConfig", () => ({
  useEndpointEnabled: () => ({ enabled: true, loading: false }),
}));
vi.mock("@app/hooks/useBackendHealth", () => ({
  useBackendHealth: () => ({ isOnline: true }),
}));
vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: pdfWorker,
}));
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) =>
        String(options?.[name]),
      ),
  }),
}));
vi.mock("@app/components/tools/compress/CompressSettings", () => ({
  default: () => null,
}));
vi.mock(
  "@app/components/tools/scannerImageSplit/ScannerImageSplitSettings",
  () => ({
    default: () => null,
  }),
);
vi.mock("@app/components/tools/convert/ConvertSettings", () => ({
  default: ({
    parameters,
    onParameterChange,
    selectedFiles,
  }: ToolAutomationSettingsProps<ConvertParameters> & {
    selectedFiles: StirlingFile[];
  }) => (
    <>
      <span data-testid="settings-file-count">{selectedFiles.length}</span>
      {[
        ["pdf", "png"],
        ["pdf", "pdfua"],
        ["image", "pdf"],
        ["svg", "pdf"],
      ].map(([from, to]) => (
        <button
          key={`${from}-${to}`}
          onClick={() => {
            onParameterChange("isSmartDetection", false);
            onParameterChange("fromExtension", from);
            onParameterChange("toExtension", to);
          }}
        >
          {from} to {to}
        </button>
      ))}
      {parameters.toExtension === "pdfua" && (
        <ConvertToPdfUaSettings
          parameters={parameters}
          onParameterChange={onParameterChange}
          selectedFiles={selectedFiles}
        />
      )}
    </>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  pdfWorker.createDocument.mockResolvedValue({ numPages: 0 });
  viewer.activeFileIndex = 0;
  navigation.workbench = "fileEditor";
  workspace.files = [
    createTestStirlingFile("report.pdf", "pdf", "application/pdf"),
    createTestStirlingFile("photo.png", "png", "image/png"),
  ];
  workspace.fileStubs = workspace.files.map((file) =>
    createNewStirlingFileStub(file, file.fileId),
  );
});

describe("tool file selection", () => {
  test("eligible selections keep their identity until file objects or order change", () => {
    const secondPdf = createTestStirlingFile(
      "second.pdf",
      "pdf",
      "application/pdf",
    );
    workspace.files.push(secondPdf);
    workspace.fileStubs.push(
      createNewStirlingFileStub(secondPdf, secondPdf.fileId),
    );
    const { result, rerender } = renderHook(useCompressOperation);
    const first = result.current.getEligibleFiles?.(
      compressParameters,
      workspace.files,
    );
    expect(first).toEqual([workspace.files[0], secondPdf]);

    rerender();
    expect(
      result.current.getEligibleFiles?.(
        { ...compressParameters, compressionLevel: 7 },
        [...workspace.files],
      ),
    ).toBe(first);

    const reversed = result.current.getEligibleFiles?.(
      compressParameters,
      [...workspace.files].reverse(),
    );
    expect(reversed).toEqual([secondPdf, workspace.files[0]]);
    expect(reversed).not.toBe(first);
  });

  test("typing Convert settings does not rerender previews or rescan an unchanged PDF", async () => {
    const renderConvert = () => (
      <MantineProvider>
        <ToolFileEligibilityProvider>
          <FilePreviews />
          <Convert />
        </ToolFileEligibilityProvider>
      </MantineProvider>
    );
    const view = render(renderConvert());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "pdf to pdfua" }));
    await waitFor(() => expect(pdfWorker.destroyDocument).toHaveBeenCalled());
    const previewRenders = onPreviewRender.mock.calls.length;

    await user.type(
      screen.getByRole("textbox", { name: "Document title" }),
      "Updated title",
    );
    expect(pdfWorker.createDocument).toHaveBeenCalledTimes(1);
    expect(onPreviewRender).toHaveBeenCalledTimes(previewRenders);

    const original = workspace.files[0];
    workspace.files = [
      createStirlingFile(
        new File(["updated pdf"], original.name, { type: original.type }),
        original.fileId,
      ),
      workspace.files[1],
    ];
    view.rerender(renderConvert());
    await waitFor(() =>
      expect(pdfWorker.destroyDocument).toHaveBeenCalledTimes(2),
    );
  });

  test("Merge requires two eligible PDFs and follows encryption changes", async () => {
    const renderMerge = () => (
      <MantineProvider>
        <Merge />
      </MantineProvider>
    );
    const view = render(renderMerge());
    expect(
      await screen.findByText(/Add at least 2 files to the workbench/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Merge PDFs/ })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Sort" }),
    ).not.toBeInTheDocument();

    const secondPdf = createTestStirlingFile(
      "second.pdf",
      "pdf",
      "application/pdf",
    );
    const secondStub = createNewStirlingFileStub(secondPdf, secondPdf.fileId);
    workspace.files.push(secondPdf);
    workspace.fileStubs.push(secondStub);
    view.rerender(renderMerge());
    expect(
      await screen.findByText(/2 files$/, { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Merge PDFs/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sort" })).toBeEnabled();

    secondStub.processedFile = { pages: [], isEncrypted: true };
    view.rerender(renderMerge());
    expect(screen.getByRole("button", { name: /Merge PDFs/ })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Sort" }),
    ).not.toBeInTheDocument();

    secondStub.processedFile.isEncrypted = false;
    view.rerender(renderMerge());
    expect(screen.getByRole("button", { name: /Merge PDFs/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sort" })).toBeEnabled();
  });

  test("hidden Files steps leave previews undimmed even with an empty selection", () => {
    const renderFlow = (filesVisible: boolean) => (
      <MantineProvider>
        <ToolFileEligibilityProvider>
          <FilePreviews />
          <EmptyFileSelectionTool filesVisible={filesVisible} />
        </ToolFileEligibilityProvider>
      </MantineProvider>
    );
    const view = render(renderFlow(false));
    const previews = [
      screen.getByRole("button", { name: /report.pdf/ }),
      screen.getByRole("button", { name: /photo.png/ }),
    ];
    for (const preview of previews) {
      expect(preview).toHaveAttribute("data-tool-skipped", "false");
    }

    view.rerender(renderFlow(true));
    for (const preview of previews) {
      expect(preview).toHaveAttribute("data-tool-skipped", "true");
    }

    view.rerender(renderFlow(false));
    for (const preview of previews) {
      expect(preview).toHaveAttribute("data-tool-skipped", "false");
      expect(preview).not.toHaveAttribute("aria-description");
    }
  });

  test("previews dim with the current tool settings and recover when the tool closes", async () => {
    const renderTool = (tool: ReactNode) => (
      <MantineProvider>
        <ToolFileEligibilityProvider>
          <FilePreviews />
          {tool}
        </ToolFileEligibilityProvider>
      </MantineProvider>
    );
    const view = render(renderTool(<Compress />));
    const pdf = screen.getByRole("button", { name: /report.pdf/ });
    const png = screen.getByRole("button", { name: /photo.png/ });
    expect(pdf).toHaveAttribute("data-tool-skipped", "false");
    expect(png).toHaveAttribute("data-tool-skipped", "true");
    expect(png).toHaveAccessibleDescription("Not included in this tool run");
    await userEvent.click(png);
    expect(onFileClick).toHaveBeenCalledWith(workspace.files[1].fileId);

    workspace.fileStubs[0].processedFile = { pages: [], isEncrypted: true };
    view.rerender(renderTool(<Compress />));
    expect(pdf).toHaveAttribute("data-tool-skipped", "true");
    workspace.fileStubs[0].processedFile.isEncrypted = false;
    view.rerender(renderTool(<Compress />));
    expect(pdf).toHaveAttribute("data-tool-skipped", "false");

    view.rerender(renderTool(<Convert />));
    await userEvent.click(screen.getByRole("button", { name: "image to pdf" }));
    expect(pdf).toHaveAttribute("data-tool-skipped", "true");
    expect(png).toHaveAttribute("data-tool-skipped", "false");

    await userEvent.click(screen.getByRole("button", { name: "svg to pdf" }));
    expect(pdf).toHaveAttribute("data-tool-skipped", "true");
    expect(png).toHaveAttribute("data-tool-skipped", "true");

    view.rerender(renderTool(null));
    expect(pdf).toHaveAttribute("data-tool-skipped", "false");
    expect(png).toHaveAttribute("data-tool-skipped", "false");
    expect(png).not.toHaveAttribute("aria-description");
  });

  test("Extract Image Scans selects an image and enables Run with no PDFs open", async () => {
    workspace.files = workspace.files.slice(1);
    workspace.fileStubs = workspace.fileStubs.slice(1);
    render(
      <MantineProvider>
        <ScannerImageSplit />
      </MantineProvider>,
    );
    expect(await screen.findByText("photo.png")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Extract Image Scans" }),
    ).toBeEnabled();
  });

  test("Compress shows only eligible files and follows protection and viewer changes", async () => {
    workspace.files.push(
      createTestStirlingFile("empty.pdf", "", "application/pdf"),
    );
    const ui = (
      <MantineProvider>
        <Compress />
      </MantineProvider>
    );
    const view = render(ui);
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(
      screen.queryByText(/files$/, { selector: "p" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compress" })).toBeEnabled();

    workspace.fileStubs[0].processedFile = { pages: [], isEncrypted: true };
    view.rerender(
      <MantineProvider>
        <Compress />
      </MantineProvider>,
    );
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compress" })).toBeDisabled();

    workspace.fileStubs[0].processedFile.isEncrypted = false;
    navigation.workbench = "viewer";
    viewer.activeFileIndex = 1;
    view.rerender(
      <MantineProvider>
        <Compress />
      </MantineProvider>,
    );
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compress/ })).toBeDisabled();

    viewer.activeFileIndex = 0;
    view.rerender(
      <MantineProvider>
        <Compress />
      </MantineProvider>,
    );
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compress/ })).toBeEnabled();
  });

  test("Convert updates Files, settings and Run count as parameters change", async () => {
    workspace.files.push(
      createTestStirlingFile("second.png", "png", "image/png"),
    );
    render(
      <MantineProvider>
        <Convert />
      </MantineProvider>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "pdf to png" }));
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert Files" })).toBeEnabled();
    expect(screen.getByTestId("settings-file-count")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "image to pdf" }));
    expect(screen.getByText(/2 files$/, { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Convert Files (2 files)" }),
    ).toBeEnabled();
    expect(screen.getByTestId("settings-file-count")).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: "svg to pdf" }));
    expect(
      screen.queryByText(/2 files$/, { selector: "p" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Convert Files" }),
    ).toBeDisabled();
    expect(screen.getByTestId("settings-file-count")).toHaveTextContent("0");

    await user.click(screen.getByRole("button", { name: "pdf to png" }));
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert Files" })).toBeEnabled();
    expect(screen.getByTestId("settings-file-count")).toHaveTextContent("1");
    expect(workspace.files).toHaveLength(3);
  });

  test("PDF/UA offers image descriptions for one eligible PDF alongside a PNG", async () => {
    render(
      <MantineProvider>
        <Convert />
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "pdf to pdfua" }));
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByTestId("pdfua-find-figures")).toBeEnabled();
    expect(
      screen.queryByTestId("pdfua-alt-text-single-file-only"),
    ).not.toBeInTheDocument();
    expect(workspace.files).toHaveLength(2);
  });
});
