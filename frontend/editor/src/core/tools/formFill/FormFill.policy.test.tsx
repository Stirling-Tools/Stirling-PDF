import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import FormFill from "@app/tools/formFill/FormFill";
import { initialFileContextState } from "@app/contexts/file/FileReducer";
import {
  getFormFillFileId,
  type FileContextState,
} from "@app/types/fileContext";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";

const mocks = vi.hoisted(() => ({
  blocked: new Set<string>(),
  submitForm: vi.fn(),
  csv: vi.fn(),
  xlsx: vi.fn(),
  apply: vi.fn(),
  reRunPolicy: vi.fn(),
  removeFiles: vi.fn(),
}));
const source = createTestStirlingFile("displayed.pdf");
const other = createTestStirlingFile("selected.pdf");
const values = { name: "Alice" };
const form = {
  state: {
    fields: [
      {
        name: "name",
        label: "Name",
        type: "text",
        value: "Alice",
        required: false,
        widgets: [],
      },
    ],
    loading: false,
    isDirty: true,
    validationErrors: {},
    activeFieldName: null,
    error: null,
  },
  forFileId: getFormFillFileId(source),
  mode: "fill",
  hasUncommittedChanges: false,
  fetchFields: vi.fn(),
  submitForm: mocks.submitForm,
  setValue: vi.fn(),
  setActiveField: vi.fn(),
  validateForm: () => true,
  setMode: vi.fn(),
  setCreationType: vi.fn(),
  setSelectedField: vi.fn(),
  setPreviewing: vi.fn(),
};
const navigation = {
  selectedTool: "formFill",
  registerUnsavedChangesChecker: vi.fn(),
  unregisterUnsavedChangesChecker: vi.fn(),
  setHasUnsavedChanges: vi.fn(),
};
function fileState(): FileContextState {
  return {
    ...initialFileContextState,
    ui: {
      ...initialFileContextState.ui,
      selectedFileIds: [other.fileId],
      policyBlocks: Object.fromEntries(
        [...mocks.blocked].map((id) => [id, "security"]),
      ),
    },
  };
}
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ files: [other, source] }),
  useFileState: () => ({ state: fileState() }),
  useFileSelector: <T,>(select: (state: FileContextState) => T) =>
    select(fileState()),
  useFileManagement: () => ({ removeFiles: mocks.removeFiles }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    activeFileId: source.fileId,
    scrollActions: { scrollToPage: vi.fn() },
  }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigation: () => navigation,
}));
vi.mock("@app/tools/formFill/FormFillContext", () => ({
  useFormFill: () => form,
  useAllFormValues: () => values,
}));
vi.mock("@app/tools/formFill/useFieldShortcuts", () => ({
  useFieldShortcuts: () => {},
}));
vi.mock("@app/tools/formFill/FieldInput", () => ({ FieldInput: () => null }));
vi.mock("@app/tools/formFill/FormFieldCreatePanel", () => ({
  FormFieldCreatePanel: () => null,
}));
vi.mock("@app/tools/formFill/FormFieldModifyPanel", () => ({
  FormFieldModifyPanel: () => null,
}));
vi.mock("@app/tools/formFill/formApi", () => ({
  extractFormFieldsCsv: (...args: unknown[]) => mocks.csv(...args),
  extractFormFieldsXlsx: (...args: unknown[]) => mocks.xlsx(...args),
}));
vi.mock("@app/tools/formFill/formFillEvents", () => ({
  dispatchFormApply: (...args: unknown[]) => mocks.apply(...args),
}));
vi.mock("@app/services/policyBlockRegistry", () => ({
  isFileBlocked: (id: string) => mocks.blocked.has(id),
}));
vi.mock("@app/hooks/usePolicyRecovery", () => ({
  usePolicyRecovery: () => ({ reRunPolicy: mocks.reRunPolicy }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.clear();
  mocks.submitForm.mockResolvedValue(new Blob(["filled"]));
  mocks.csv.mockResolvedValue(new Blob(["csv"]));
  mocks.xlsx.mockResolvedValue(new Blob(["xlsx"]));
});

function panel() {
  return (
    <MantineProvider env="test">
      <FormFill />
    </MantineProvider>
  );
}

describe("blocked form actions", () => {
  it("disables save and every data export, while retaining retry and close", async () => {
    const view = render(panel());
    mocks.blocked.add(source.fileId);
    view.rerender(panel());
    for (const name of ["formFill.save", "JSON", "CSV", "XLSX"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    expect(mocks.submitForm).not.toHaveBeenCalled();
    expect(mocks.csv).not.toHaveBeenCalled();
    expect(mocks.xlsx).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "policy.blockedReRun" }),
    );
    expect(mocks.reRunPolicy).toHaveBeenCalledWith(source.fileId);
    expect(
      screen.getByRole("button", { name: "policy.blockedClose" }),
    ).toBeEnabled();
    mocks.blocked.clear();
    view.rerender(panel());
    expect(screen.getByRole("button", { name: "formFill.save" })).toBeEnabled();
  });

  it("saves the displayed form even when another file is selected", async () => {
    render(panel());
    await userEvent.click(
      screen.getByRole("button", { name: "formFill.save" }),
    );
    expect(mocks.submitForm).toHaveBeenCalledWith(source, false);
    expect(mocks.apply).toHaveBeenCalledWith(expect.any(Blob), source);
  });

  it("guards JSON export and keyboard save before the UI receives the failure", async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(panel());
    mocks.blocked.add(source.fileId);
    await userEvent.keyboard("{Control>}s{/Control}");
    await userEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(mocks.submitForm).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it.each(["CSV", "XLSX"])(
    "refuses a %s download if its source fails during extraction",
    async (label) => {
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      const extract = label === "CSV" ? mocks.csv : mocks.xlsx;
      extract.mockImplementationOnce(async () => {
        mocks.blocked.add(source.fileId);
        return new Blob(["export"]);
      });
      render(panel());
      await userEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => expect(extract).toHaveBeenCalledWith(source, values));
      expect(click).not.toHaveBeenCalled();
      click.mockRestore();
    },
  );
});
