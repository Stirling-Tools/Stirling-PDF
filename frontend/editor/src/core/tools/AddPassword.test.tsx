import { act, render, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PermissionFlag } from "pdfjs-dist/legacy/build/pdf.mjs";
import type AddPasswordSettings from "@app/components/tools/addPassword/AddPasswordSettings";
import type ChangePermissionsSettings from "@app/components/tools/changePermissions/ChangePermissionsSettings";
import type { ToolFlowConfig } from "@app/components/tools/shared/createToolFlow";
import type { AddPasswordFullParameters } from "@app/hooks/tools/addPassword/useAddPasswordParameters";
import { defaultParameters } from "@app/hooks/tools/changePermissions/useChangePermissionsParameters";
import AddPassword from "@app/tools/AddPassword";
import { createStirlingFile, type StirlingFile } from "@app/types/fileContext";

const { selection, operation, flow, createDocument, destroyDocument } =
  vi.hoisted(() => ({
    selection: { files: [] as StirlingFile[] },
    operation: {
      files: [] as File[],
      downloadUrl: null,
      isLoading: false,
      resetResults: vi.fn(),
      executeOperation: vi.fn().mockResolvedValue(undefined),
      undoOperation: vi.fn(),
    },
    flow: vi.fn<(config: ToolFlowConfig<AddPasswordFullParameters>) => null>(
      () => null,
    ),
    createDocument: vi.fn(),
    destroyDocument: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock("@app/components/tools/shared/createToolFlow", () => ({
  createToolFlow: flow,
}));
vi.mock("@app/hooks/tools/shared/useViewScopedFiles", () => ({
  useViewScopedFiles: () => selection.files,
}));
vi.mock("@app/hooks/tools/addPassword/useAddPasswordOperation", () => ({
  useAddPasswordOperation: () => operation,
}));
vi.mock("@app/hooks/useEndpointConfig", () => ({
  useEndpointEnabled: () => ({ enabled: true, loading: false }),
}));
vi.mock("@app/components/tooltips/useAddPasswordTips", () => ({
  useAddPasswordTips: () => ({}),
}));
vi.mock("@app/components/tooltips/useAddPasswordPermissionsTips", () => ({
  useAddPasswordPermissionsTips: () => ({}),
}));
vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: { createDocument, destroyDocument },
}));

function currentFlow() {
  return flow.mock.calls.at(-1)![0];
}

function passwordSettings() {
  return (
    currentFlow().steps[0].content as ReactElement<
      ComponentProps<typeof AddPasswordSettings>
    >
  ).props;
}

function permissionSettings() {
  return (
    currentFlow().steps[1].content as ReactElement<
      ComponentProps<typeof ChangePermissionsSettings>
    >
  ).props;
}

beforeEach(() => {
  vi.clearAllMocks();
  createDocument.mockReset();
  selection.files = [createStirlingFile(new File([], "input.pdf"))];
  operation.files = [];
  operation.isLoading = false;
});

describe("Add Password permission detection", () => {
  test("loads existing restrictions before encryption and preserves password settings", async () => {
    let resolvePermissions!: (permissions: number[]) => void;
    const pending = new Promise<number[]>((resolve) => {
      resolvePermissions = resolve;
    });
    createDocument.mockResolvedValueOnce({
      getPermissions: () => pending,
    });
    render(<AddPassword />);

    expect(currentFlow().executeButton?.disabled).toBe(true);
    expect(permissionSettings().isLoading).toBe(true);
    act(() => {
      passwordSettings().onParameterChange("password", "reader-secret");
      passwordSettings().onParameterChange("ownerPassword", "owner-secret");
      passwordSettings().onParameterChange("keyLength", 256);
    });

    await act(async () =>
      resolvePermissions(
        Object.values(PermissionFlag).filter(
          (flag) => flag !== PermissionFlag.PRINT,
        ),
      ),
    );
    expect(permissionSettings().parameters).toEqual({
      ...defaultParameters,
      preventPrinting: true,
    });
    expect(currentFlow().executeButton?.disabled).toBe(false);

    act(() => permissionSettings().onParameterChange("preventModify", true));
    await act(async () => currentFlow().executeButton?.onClick());
    expect(operation.executeOperation).toHaveBeenCalledWith(
      {
        password: "reader-secret",
        ownerPassword: "owner-secret",
        keyLength: 256,
        permissions: {
          ...defaultParameters,
          preventPrinting: true,
          preventModify: true,
        },
      },
      selection.files,
    );
    expect(createDocument).toHaveBeenCalledTimes(1);
  });

  test("keeps batch permissions manual", async () => {
    selection.files.push(createStirlingFile(new File([], "second.pdf")));
    render(<AddPassword />);

    expect(createDocument).not.toHaveBeenCalled();
    expect(permissionSettings().multipleFiles).toBe(true);
    expect(currentFlow().executeButton?.disabled).toBe(false);

    act(() =>
      permissionSettings().onParameterChange("preventExtractContent", true),
    );
    await act(async () => currentFlow().executeButton?.onClick());
    expect(operation.executeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: { ...defaultParameters, preventExtractContent: true },
      }),
      selection.files,
    );
  });

  test("does not read encrypted outputs or reset results during processing and review", async () => {
    createDocument.mockResolvedValueOnce({ getPermissions: async () => null });
    const { rerender } = render(<AddPassword />);
    await waitFor(() => expect(permissionSettings().isLoading).toBe(false));
    operation.resetResults.mockClear();

    operation.isLoading = true;
    selection.files = [createStirlingFile(new File([], "encrypted.pdf"))];
    rerender(<AddPassword />);
    expect(permissionSettings().disabled).toBe(true);

    operation.files = selection.files;
    operation.isLoading = false;
    rerender(<AddPassword />);

    expect(currentFlow().review.isVisible).toBe(true);
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(operation.resetResults).not.toHaveBeenCalled();
  });

  test("expands the permission step to show read failures", async () => {
    createDocument.mockRejectedValueOnce(new Error("Cannot read PDF"));
    render(<AddPassword />);
    expect(currentFlow().steps[1].isCollapsed).toBe(true);

    await waitFor(() => expect(permissionSettings().hasReadError).toBe(true));
    expect(currentFlow().steps[1].isCollapsed).toBe(false);
    expect(currentFlow().executeButton?.disabled).toBe(false);
  });
});
