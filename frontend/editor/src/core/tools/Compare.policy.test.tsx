import type { ComponentProps } from "react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import Compare from "@app/tools/Compare";
import type { FileSelectorPicker } from "@app/components/shared/FileSelectorPicker";
import type { ToolFlowConfig } from "@app/components/tools/shared/createToolFlow";
import { defaultParameters } from "@app/hooks/tools/compare/useCompareParameters";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";
import { createNewStirlingFileStub } from "@app/types/fileContext";

const mocks = vi.hoisted(() => ({
  blocked: new Set<string>(),
  removeFiles: vi.fn(),
  reRunPolicy: vi.fn(),
  operation: {
    executeOperation: vi.fn(),
    cancelOperation: vi.fn(),
    resetResults: vi.fn(),
    isLoading: false,
    result: null,
  },
  navigation: { setWorkbench: vi.fn() },
  workflow: {
    registerCustomWorkbenchView: vi.fn(),
    unregisterCustomWorkbenchView: vi.fn(),
    setCustomWorkbenchViewData: vi.fn(),
    clearCustomWorkbenchViewData: vi.fn(),
  },
}));
const choices = [
  createTestStirlingFile("original.pdf"),
  createTestStirlingFile("edited.pdf"),
].map((file) => ({
  stirlingFile: file,
  stub: createNewStirlingFileStub(file, file.fileId),
}));
vi.mock("@app/hooks/tools/shared/useBaseTool", () => ({
  useBaseTool: () => {
    const [parameters, setParameters] = useState(defaultParameters);
    return {
      params: { parameters, setParameters },
      operation: mocks.operation,
      selectedFiles: [],
      endpointEnabled: true,
    };
  },
}));
vi.mock("@app/hooks/useBlockedFiles", () => ({
  useBlockedFiles: (ids: string[]) => ids.filter((id) => mocks.blocked.has(id)),
}));
vi.mock("@app/services/policyBlockRegistry", () => ({
  isFileBlocked: (id: string) => mocks.blocked.has(id),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useFileManagement: () => ({ removeFiles: mocks.removeFiles }),
}));
vi.mock("@app/hooks/usePolicyRecovery", () => ({
  usePolicyRecovery: () => ({ reRunPolicy: mocks.reRunPolicy }),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => mocks.workflow,
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({ actions: mocks.navigation }),
}));
vi.mock("@app/components/tools/compare/CompareWorkbenchView", () => ({
  default: () => null,
}));
vi.mock("@app/components/shared/filePreview/DocumentThumbnail", () => ({
  default: () => null,
}));
vi.mock("@app/components/shared/FileSelectorPicker", () => ({
  FileSelectorPicker: ({
    testId,
    onSelect,
    disabled,
  }: ComponentProps<typeof FileSelectorPicker>) => (
    <button
      data-testid={testId}
      disabled={disabled}
      onClick={() =>
        onSelect(choices[testId === "compare-slot-base-add" ? 0 : 1])
      }
    >
      Pick
    </button>
  ),
}));
vi.mock("@app/components/tools/shared/createToolFlow", () => ({
  createToolFlow: ({ steps, executeButton }: ToolFlowConfig) => (
    <>
      {steps.map((step) => (
        <div key={step.title}>{step.content}</div>
      ))}
      <button
        onClick={executeButton?.onClick}
        disabled={executeButton?.disabled}
      >
        Compare
      </button>
    </>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.clear();
});

describe("Compare selected policy failures", () => {
  it("disables Run and Swap when a picked file becomes blocked, and restores them after recovery", async () => {
    const content = () => (
      <MantineProvider env="test">
        <Compare />
      </MantineProvider>
    );
    const view = render(content());
    await userEvent.click(screen.getByTestId("compare-slot-base-add"));
    await userEvent.click(screen.getByTestId("compare-slot-comparison-add"));
    const run = screen.getByRole("button", { name: "Compare" });
    expect(run).toBeEnabled();
    mocks.blocked.add(choices[0].stirlingFile.fileId);
    view.rerender(content());
    expect(run).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "compare.swap.label" }),
    ).toBeDisabled();
    expect(screen.getByTestId("compare-slot-base")).toHaveAttribute(
      "data-policy-blocked",
      "true",
    );
    await userEvent.click(run);
    expect(mocks.operation.executeOperation).not.toHaveBeenCalled();
    mocks.blocked.clear();
    view.rerender(content());
    expect(run).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "compare.swap.label" }),
    ).toBeEnabled();
  });

  it("closes the blocked local slot while keeping the other file picked", async () => {
    const content = () => (
      <MantineProvider env="test">
        <Compare />
      </MantineProvider>
    );
    const view = render(content());
    await userEvent.click(screen.getByTestId("compare-slot-base-add"));
    await userEvent.click(screen.getByTestId("compare-slot-comparison-add"));
    mocks.blocked.add(choices[0].stirlingFile.fileId);
    view.rerender(content());
    await userEvent.click(
      screen.getByRole("button", { name: "policy.blockedClose" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("compare-slot-base")).toHaveAttribute(
        "data-slot-state",
        "empty",
      ),
    );
    expect(screen.getByTestId("compare-slot-comparison")).toHaveAttribute(
      "data-slot-filename",
      "edited.pdf",
    );
    expect(mocks.removeFiles).toHaveBeenCalledWith(
      [choices[0].stirlingFile.fileId],
      false,
    );
    expect(mocks.operation.cancelOperation).toHaveBeenCalled();
  });
});
