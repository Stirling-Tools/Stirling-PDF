import { createContext } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import Compress from "@app/tools/Compress";
import Convert from "@app/tools/Convert";
import ScannerImageSplit from "@app/tools/ScannerImageSplit";
import ConvertToPdfUaSettings from "@app/components/tools/convert/ConvertToPdfUaSettings";
import type { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import type { ToolAutomationSettingsProps } from "@app/hooks/tools/shared/toolOperationTypes";
import {
  createNewStirlingFileStub,
  type StirlingFile,
  type StirlingFileStub,
} from "@app/types/fileContext";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";

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

vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({
    ...workspace,
    fileIds: workspace.files.map((file) => file.fileId),
  }),
  useFileContext: () => ({ selectors, actions: {} }),
  useFileSelectors: () => selectors,
  useFileActions: () => ({ actions: {} }),
  useFileSelection: () => ({ setSelectedFiles: vi.fn() }),
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
vi.mock("@app/hooks/usePdfSignatureDetection", () => ({
  usePdfSignatureDetection: () => ({
    hasDigitalSignatures: false,
    isChecking: false,
  }),
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
