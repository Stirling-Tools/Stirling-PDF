import { act, render } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type ConvertSettings from "@app/components/tools/convert/ConvertSettings";
import type { ToolFlowConfig } from "@app/components/tools/shared/createToolFlow";
import Convert from "@app/tools/Convert";
import { requestToolPreset } from "@app/services/toolPresetRequests";
import { createStirlingFile, type StirlingFile } from "@app/types/fileContext";

const { files, setSelectedFiles, flow } = vi.hoisted(() => ({
  files: { active: [] as StirlingFile[], selected: [] as StirlingFile[] },
  setSelectedFiles: vi.fn(),
  flow: vi.fn<(config: ToolFlowConfig<unknown>) => null>(() => null),
}));

vi.mock("@app/components/tools/shared/createToolFlow", () => ({
  createToolFlow: flow,
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ files: files.active }),
  useFileSelection: () => ({ setSelectedFiles }),
}));
vi.mock("@app/hooks/tools/shared/useViewScopedFiles", () => ({
  useViewScopedFiles: () => files.selected,
}));
vi.mock("@app/hooks/tools/convert/useConvertOperation", () => ({
  useConvertOperation: () => ({
    files: [],
    downloadUrl: null,
    errorMessage: null,
    isLoading: false,
    resetResults: vi.fn(),
  }),
}));
vi.mock("@app/hooks/useEndpointConfig", () => ({
  useEndpointEnabled: () => ({ enabled: true, loading: false }),
}));

/** The parameters Convert last handed its settings step. */
function currentParameters() {
  const config = flow.mock.calls.at(-1)![0];
  const settings = config.steps[0].content as ReactElement<
    ComponentProps<typeof ConvertSettings>
  >;
  return settings.props.parameters;
}

const pdf = () =>
  createStirlingFile(
    new File(["%PDF"], "report.pdf", { type: "application/pdf" }),
  );

describe("Convert subtool presets", () => {
  beforeEach(() => {
    files.active = [];
    files.selected = [];
    setSelectedFiles.mockClear();
    flow.mockClear();
  });

  test("applies a preset requested before the tool opened, with no files loaded", () => {
    requestToolPreset("convert", "pdf-to-png");
    render(<Convert />);
    // The mount-time reset for "no files" must not undo the preset.
    expect(currentParameters()).toMatchObject({
      fromExtension: "pdf",
      toExtension: "png",
      isSmartDetection: false,
    });
  });

  test("keeps a preset's nested options", () => {
    requestToolPreset("convert", "pdf-to-pdfa-1b");
    render(<Convert />);
    expect(currentParameters()).toMatchObject({
      fromExtension: "pdf",
      toExtension: "pdfa",
      pdfaOptions: { outputFormat: "pdfa-1" },
    });
  });

  test("applies a preset requested while open, and narrows the selection to matching files", () => {
    const file = pdf();
    files.active = [file];
    files.selected = [file];
    render(<Convert />);
    act(() => requestToolPreset("convert", "pdf-to-docx"));
    expect(currentParameters()).toMatchObject({
      fromExtension: "pdf",
      toExtension: "docx",
    });
    expect(setSelectedFiles).toHaveBeenLastCalledWith([file.fileId]);
  });
});
