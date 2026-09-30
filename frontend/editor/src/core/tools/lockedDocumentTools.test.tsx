import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

// Each locked-document tool must show the shared password field or original-file notice, and
// hold Run while a locked file has no password. The tool flow is flattened to its visible steps.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));
vi.mock("@mantine/core", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PasswordInput: (props: { "data-testid"?: string; description: string }) => (
    <input data-testid={props["data-testid"]} aria-label={props.description} />
  ),
}));
vi.mock("@app/components/tools/shared/createToolFlow", () => ({
  createToolFlow: (config: {
    steps: { title: string; isVisible?: boolean; content: ReactNode }[];
    executeButton: { paramsValid?: boolean; disabled?: boolean };
  }) => {
    const { paramsValid, disabled } = config.executeButton;
    const canRun = paramsValid ?? !disabled;
    return (
      <div>
        {config.steps
          .filter((step) => step.isVisible !== false)
          .map((step) => (
            <section key={step.title} aria-label={step.title}>
              {step.content}
            </section>
          ))}
        <button type="button" data-testid="run" disabled={!canRun} />
      </div>
    );
  },
}));

const lockedIds = new Set<string>();
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileContext: () => ({
    selectors: {
      getStirlingFileStub: (id: string) => ({
        processedFile: { isEncrypted: lockedIds.has(id) },
      }),
    },
  }),
}));

let selectedFiles: unknown[] = [];
vi.mock("@app/hooks/tools/shared/useBaseTool", () => ({
  useBaseTool: (_id: string, useParams: () => { parameters: unknown }) => ({
    selectedFiles,
    params: {
      parameters: useParams().parameters,
      updateParameter: vi.fn(),
      validateParameters: () => true,
    },
    operation: { results: [], isLoading: false, errorMessage: null, files: [] },
    endpointLoading: false,
    endpointEnabled: true,
    settingsCollapsed: false,
    hasResults: false,
    hasFiles: true,
    handleExecute: vi.fn(),
    handleSettingsReset: vi.fn(),
    handleUndo: vi.fn(),
    handleThumbnailClick: vi.fn(),
  }),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    registerCustomWorkbenchView: vi.fn(),
    unregisterCustomWorkbenchView: vi.fn(),
    setCustomWorkbenchViewData: vi.fn(),
    clearCustomWorkbenchViewData: vi.fn(),
  }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({ actions: { setWorkbench: vi.fn() } }),
  useNavigationState: () => ({ selectedTool: null, workbench: "viewer" }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: {} }),
}));
vi.mock("@app/components/tooltips/useCertificateTypeTips", () => ({
  useCertificateTypeTips: () => undefined,
}));
vi.mock("@app/components/tooltips/useSignatureAppearanceTips", () => ({
  useSignatureAppearanceTips: () => undefined,
}));
vi.mock("@app/components/tooltips/useSignModeTips", () => ({
  useSignModeTips: () => undefined,
}));
vi.mock("@app/components/tools/certSign/CertificateTypeSettings", () => ({
  default: () => null,
}));
vi.mock("@app/components/tools/certSign/CertificateFormatSettings", () => ({
  default: () => null,
}));
vi.mock("@app/components/tools/certSign/CertificateFilesSettings", () => ({
  default: () => null,
}));
vi.mock("@app/components/tools/certSign/HardwareCertificateSettings", () => ({
  default: () => null,
}));
vi.mock("@app/components/tools/certSign/SignatureAppearanceSettings", () => ({
  default: () => null,
}));
vi.mock("@app/components/tools/timestampPdf/TimestampPdfSettings", () => ({
  default: () => null,
}));
vi.mock(
  "@app/components/tools/validateSignature/ValidateSignatureSettings",
  () => ({ default: () => null }),
);
vi.mock(
  "@app/components/tools/validateSignature/ValidateSignatureResults",
  () => ({ default: () => null }),
);
vi.mock(
  "@app/components/tools/validateSignature/ValidateSignatureReportView",
  () => ({ default: () => null }),
);

import CertSign from "@app/tools/CertSign";
import TimestampPdf from "@app/tools/TimestampPdf";
import ValidateSignature from "@app/tools/ValidateSignature";
import {
  clearLockedDocumentAccess,
  setLockedDocumentAccess,
} from "@app/services/lockedDocumentAccess";
import { createStirlingFile } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import type { ToolComponent } from "@app/types/tool";

const file = (id: string) =>
  createStirlingFile(
    new File(["%PDF"], `${id}.pdf`, { type: "application/pdf" }),
    id as FileId,
  );

const TOOLS: [string, ToolComponent, RegExp][] = [
  ["Sign with Certificate", CertSign, /existing signatures stay valid/],
  ["Timestamp PDF", TimestampPdf, /existing signatures stay valid/],
  [
    "Validate PDF Signature",
    ValidateSignature,
    /checked exactly as they were signed/,
  ],
];

const renderTool = (Tool: ToolComponent) =>
  render(
    <MantineProvider>
      <Tool onPreviewFile={vi.fn()} onComplete={vi.fn()} onError={vi.fn()} />
    </MantineProvider>,
  );

afterEach(() => {
  cleanup();
  clearLockedDocumentAccess();
  lockedIds.clear();
  selectedFiles = [];
});

describe.each(TOOLS)("%s", (_name, Tool, originalNotice) => {
  it("asks for the password of a locked file and holds Run until it is entered", () => {
    lockedIds.add("locked");
    selectedFiles = [file("locked")];

    renderTool(Tool);

    expect(screen.getByTestId("locked-document-password")).toBeInTheDocument();
    expect(screen.getByTestId("run")).toBeDisabled();
  });

  it("runs once the locked file has a password", () => {
    lockedIds.add("locked");
    const locked = file("locked");
    selectedFiles = [locked];
    setLockedDocumentAccess("locked", {
      source: locked,
      password: "typed",
      origin: "entered",
    });

    renderTool(Tool);

    expect(screen.getByTestId("run")).toBeEnabled();
  });

  it("says an unlocked copy goes out as the original upload", () => {
    selectedFiles = [file("unlocked")];
    setLockedDocumentAccess("unlocked", {
      source: file("original"),
      password: "pw",
      origin: "unlocked",
    });

    renderTool(Tool);

    expect(
      screen.getByTestId("locked-document-original-notice"),
    ).toHaveTextContent(originalNotice);
    expect(
      screen.queryByTestId("locked-document-password"),
    ).not.toBeInTheDocument();
  });

  it("shows nothing extra for a plain PDF", () => {
    selectedFiles = [file("plain")];

    renderTool(Tool);

    expect(screen.queryByLabelText("Locked PDF")).not.toBeInTheDocument();
    expect(screen.getByTestId("run")).toBeEnabled();
  });
});
