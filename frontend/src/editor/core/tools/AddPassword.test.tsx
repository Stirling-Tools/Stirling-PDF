import { act, render, waitFor } from "@testing-library/react";
import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
} from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PdfPermissionFlag } from "@embedpdf/models";
import AddPasswordSettings from "@editor/components/tools/addPassword/AddPasswordSettings";
import ChangePermissionsSettings from "@editor/components/tools/changePermissions/ChangePermissionsSettings";
import type { ToolFlowConfig } from "@editor/components/tools/shared/createToolFlow";
import type { AddPasswordFullParameters } from "@editor/hooks/tools/addPassword/useAddPasswordParameters";
import { defaultParameters } from "@editor/hooks/tools/changePermissions/useChangePermissionsParameters";
import AddPassword from "@editor/tools/AddPassword";
import {
  createStirlingFile,
  type StirlingFile,
} from "@editor/types/fileContext";
import {
  clearPdfAccess,
  type PdfAccess,
} from "@editor/services/pdfAccessService";

const { selection, operation, flow, inspectAccess } = vi.hoisted(() => ({
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
  inspectAccess: vi.fn(),
}));

vi.mock("@editor/components/tools/shared/createToolFlow", () => ({
  createToolFlow: flow,
}));
vi.mock("@editor/hooks/tools/shared/useViewScopedFiles", () => ({
  useViewScopedFiles: () => selection.files,
}));
vi.mock("@editor/hooks/tools/addPassword/useAddPasswordOperation", () => ({
  useAddPasswordOperation: () => operation,
}));
vi.mock("@editor/hooks/useEndpointConfig", () => ({
  useEndpointEnabled: () => ({ enabled: true, loading: false }),
}));
vi.mock("@editor/components/tooltips/useAddPasswordTips", () => ({
  useAddPasswordTips: () => ({}),
}));
vi.mock("@editor/components/tooltips/useAddPasswordPermissionsTips", () => ({
  useAddPasswordPermissionsTips: () => ({}),
}));
vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  ensureLocalPdfAccess: inspectAccess,
}));

const access: PdfAccess = {
  password: "",
  encrypted: false,
  signed: false,
  ownerAuthenticated: false,
  permissions: PdfPermissionFlag.AllowAll,
  pageCount: 1,
};

function currentFlow() {
  return flow.mock.calls.at(-1)![0];
}

function passwordSettings() {
  return (
    Children.toArray(
      (
        currentFlow().steps[0].content as ReactElement<{
          children: React.ReactNode;
        }>
      ).props.children,
    ).find(
      (child) => isValidElement(child) && child.type === AddPasswordSettings,
    ) as ReactElement<ComponentProps<typeof AddPasswordSettings>>
  ).props;
}

function permissionSettings() {
  return (
    Children.toArray(
      (
        currentFlow().steps[1].content as ReactElement<{
          children: React.ReactNode;
        }>
      ).props.children,
    ).find(
      (child) =>
        isValidElement(child) && child.type === ChangePermissionsSettings,
    ) as ReactElement<ComponentProps<typeof ChangePermissionsSettings>>
  ).props;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearPdfAccess();
  inspectAccess.mockReset().mockResolvedValue(access);
  selection.files = [createStirlingFile(new File([], "input.pdf"))];
  operation.files = [];
  operation.isLoading = false;
});

describe("Add Password permission detection", () => {
  test("loads existing restrictions before encryption and preserves password settings", async () => {
    let resolveDocument!: (document: PdfAccess) => void;
    const pending = new Promise<PdfAccess>((resolve) => {
      resolveDocument = resolve;
    });
    inspectAccess.mockReturnValueOnce(pending);
    render(<AddPassword />);

    expect(currentFlow().executeButton?.disabled).toBe(true);
    expect(permissionSettings().isLoading).toBe(true);
    act(() => {
      passwordSettings().onParameterChange("password", "reader-secret");
      passwordSettings().onParameterChange("ownerPassword", "owner-secret");
      passwordSettings().onParameterChange("keyLength", 256);
    });

    await act(async () =>
      resolveDocument({
        ...access,
        permissions: PdfPermissionFlag.AllowAll & ~PdfPermissionFlag.Print,
      }),
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
    expect(inspectAccess).toHaveBeenCalledTimes(1);
  });

  test("keeps batch permissions manual", async () => {
    selection.files.push(createStirlingFile(new File([], "second.pdf")));
    render(<AddPassword />);

    expect(inspectAccess).not.toHaveBeenCalled();
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

  test("applies existing manual restrictions after expanding a single selection to a batch", async () => {
    const { rerender } = render(<AddPassword />);
    await waitFor(() => expect(permissionSettings().isLoading).toBe(false));
    act(() => {
      permissionSettings().onParameterChange("preventPrinting", true);
      permissionSettings().onParameterChange("preventModify", true);
    });

    selection.files = [
      ...selection.files,
      createStirlingFile(new File([], "second.pdf")),
    ];
    rerender(<AddPassword />);
    expect(currentFlow().executeButton?.disabled).toBe(false);

    operation.isLoading = true;
    rerender(<AddPassword />);
    operation.isLoading = false;
    rerender(<AddPassword />);
    await act(async () => currentFlow().executeButton?.onClick());

    expect(operation.executeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: {
          ...defaultParameters,
          preventPrinting: true,
          preventModify: true,
        },
      }),
      selection.files,
    );
    expect(inspectAccess).toHaveBeenCalledTimes(1);
  });

  test("does not read encrypted outputs or reset results during processing and review", async () => {
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
    expect(inspectAccess).toHaveBeenCalledTimes(1);
    expect(operation.resetResults).not.toHaveBeenCalled();
  });

  test("expands the permission step to show read failures", async () => {
    inspectAccess.mockRejectedValueOnce(new Error("Cannot read PDF"));
    render(<AddPassword />);
    expect(currentFlow().steps[1].isCollapsed).toBe(true);

    await waitFor(() => expect(permissionSettings().hasReadError).toBe(true));
    expect(currentFlow().steps[1].isCollapsed).toBe(false);
    expect(currentFlow().executeButton?.disabled).toBe(false);
  });
});
