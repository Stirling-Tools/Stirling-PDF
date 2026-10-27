import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useRemovePasswordOperation,
  removePasswordOperationConfig,
} from "@editor/hooks/tools/removePassword/useRemovePasswordOperation";
import type { RemovePasswordParameters } from "@editor/hooks/tools/removePassword/useRemovePasswordParameters";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  clearPdfAccess,
  rememberPdfAccess,
} from "@editor/services/pdfAccessService";

vi.mock("../shared/useToolOperation", async () => {
  const actual = await vi.importActual("../shared/useToolOperation"); // Need to keep ToolType etc.
  return {
    ...actual,
    useToolOperation: vi.fn(),
  };
});

// Mock the translation hook
const mockT = vi.fn((key: string) => `translated-${key}`);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Mock the error handler
vi.mock("../../../utils/toolErrorHandler", () => ({
  createStandardErrorHandler: vi.fn(() => "error-handler-function"),
}));

// Import the mocked function
import {
  SingleFileToolOperationConfig,
  ToolOperationHook,
  ToolType,
  useToolOperation,
} from "@editor/hooks/tools/shared/useToolOperation";

describe("useRemovePasswordOperation", () => {
  const mockUseToolOperation = vi.mocked(useToolOperation);

  const getToolConfig = () =>
    mockUseToolOperation.mock
      .calls[0][0] as SingleFileToolOperationConfig<RemovePasswordParameters>;

  const mockToolOperationReturn: ToolOperationHook<unknown> = {
    files: [],
    thumbnails: [],
    downloadUrl: null,
    downloadFilename: "",
    isLoading: false,
    errorMessage: null,
    status: "",
    isGeneratingThumbnails: false,
    progress: null,
    executeOperation: vi.fn(),
    resetResults: vi.fn(),
    clearError: vi.fn(),
    cancelOperation: vi.fn(),
    undoOperation: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearPdfAccess();
    mockUseToolOperation.mockReturnValue(mockToolOperationReturn);
  });

  function protectedFile(opening: boolean, owner: boolean) {
    const file = createStirlingFile(
      new File(["PDF"], "test.pdf", { type: "application/pdf" }),
    );
    rememberPdfAccess(file, {
      password: opening ? "reader" : "",
      encrypted: opening || owner,
      requiresOpeningPassword: opening,
      ownerAuthenticated: false,
      signed: false,
      permissions: 0,
      pageCount: 1,
    });
    return file;
  }

  test.each([
    { opening: false, owner: false, password: "", ownerPassword: null },
    { opening: false, owner: true, password: "", ownerPassword: "owner" },
    { opening: true, owner: true, password: "reader", ownerPassword: "owner" },
  ])(
    "omits known absent roles and submits unknown roles (opening=$opening, encrypted-owner=$owner)",
    ({ opening, owner, password, ownerPassword }) => {
      renderHook(() => useRemovePasswordOperation());
      const form = getToolConfig().buildFormData(
        { password: "reader", ownerPassword: "owner" },
        protectedFile(opening, owner),
      );
      expect(form.get("password")).toBe(password);
      expect(form.get("ownerPassword")).toBe(ownerPassword);
    },
  );

  test.each(["opening", "owner", "both"] as const)(
    "skips known absent %s passwords and lets the endpoint validate unknown roles",
    async (remove) => {
      const opening = protectedFile(true, false);
      const owner = protectedFile(false, true);
      const both = protectedFile(true, true);
      const plain = protectedFile(false, false);
      const params = {
        password: remove === "owner" ? "" : "reader",
        ownerPassword: remove === "opening" ? "" : "owner",
      };
      const { result } = renderHook(() => useRemovePasswordOperation());
      await result.current.executeOperation(params, [
        opening,
        owner,
        both,
        plain,
      ]);
      expect(mockToolOperationReturn.executeOperation).toHaveBeenCalledWith(
        params,
        remove === "opening" ? [opening, both] : [opening, owner, both],
      );
    },
  );

  test.each([
    {
      description: "with valid password",
      password: "test-password",
    },
    {
      description: "with complex password",
      password: "C0mpl3x@P@ssw0rd!",
    },
    {
      description: "with single character password",
      password: "a",
    },
  ])("should create form data correctly $description", ({ password }) => {
    renderHook(() => useRemovePasswordOperation());

    const callArgs = getToolConfig();
    const buildFormData = callArgs.buildFormData;

    const testParameters: RemovePasswordParameters = {
      password,
    };

    const testFile = new File(["test content"], "test.pdf", {
      type: "application/pdf",
    });
    const formData = buildFormData(testParameters, testFile);

    // Verify the form data contains the file
    expect(formData.get("fileInput")).toBe(testFile);

    // Verify password parameter
    expect(formData.get("password")).toBe(password);
  });

  test("legacy automation and unprotected-copy authentication retain owner credentials", () => {
    const form = removePasswordOperationConfig.buildFormData(
      { password: "owner" },
      protectedFile(false, true),
    );
    expect(form.get("password")).toBe("owner");
    expect(form.has("ownerPassword")).toBe(false);
  });

  test("retains selective owner removal through API parameter conversion", () => {
    const parameters = { password: "", ownerPassword: "owner" };
    const api = removePasswordOperationConfig.toApiParams!(parameters);
    expect(removePasswordOperationConfig.fromApiParams!(api)).toEqual(
      parameters,
    );
    const form = removePasswordOperationConfig.buildFormData(
      parameters,
      protectedFile(false, true),
    );
    expect(form.get("password")).toBe("");
    expect(form.get("ownerPassword")).toBe("owner");
  });

  test("should use correct translation for error messages", () => {
    renderHook(() => useRemovePasswordOperation());

    expect(mockT).toHaveBeenCalledWith(
      "removePassword.error.failed",
      "An error occurred while removing the password from the PDF.",
    );
  });

  test.each([
    { property: "toolType" as const, expectedValue: ToolType.singleFile },
    {
      property: "endpoint" as const,
      expectedValue: "/api/v1/security/remove-password",
    },
    { property: "operationType" as const, expectedValue: "removePassword" },
  ])("should configure $property correctly", ({ property, expectedValue }) => {
    renderHook(() => useRemovePasswordOperation());

    const callArgs = getToolConfig();
    expect(callArgs[property]).toBe(expectedValue);
  });
});
