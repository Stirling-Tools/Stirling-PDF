/**
 * An append tool run through useToolOperation on a locked PDF: the file is eligible, the request
 * carries the locked bytes and documentPassword, the still-locked output can be opened again
 * without asking, and undo restores the input's password.
 */

import React from "react";
import { describe, test, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useToolOperation } from "@app/hooks/tools/shared/useToolOperation";
import { timestampPdfOperationConfig } from "@app/hooks/tools/timestampPdf/useTimestampPdfOperation";
import { defaultParameters } from "@app/hooks/tools/timestampPdf/useTimestampPdfParameters";
import {
  FileContextProvider,
  useFileActions,
  useFileState,
} from "@app/contexts/FileContext";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { I18nextProvider } from "react-i18next";
import i18n from "@app/i18n/config";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";
import * as thumbnailUtils from "@app/utils/thumbnailUtils";
import { createNewStirlingFileStub } from "@app/types/fileContext";
import { MantineProvider } from "@mantine/core";
import { isAwaitingUnlock } from "@app/services/pendingUnlocks";
import {
  clearLockedDocumentAccess,
  getLockedDocumentAccess,
  setLockedDocumentAccess,
} from "@app/services/lockedDocumentAccess";

vi.mock("axios", () => ({
  default: {
    CancelToken: {
      source: vi.fn(() => ({ token: "mock-cancel-token", cancel: vi.fn() })),
    },
    isCancel: vi.fn(() => false),
  },
}));

vi.mock("../../services/apiClient", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  },
}));

import apiClient from "@app/services/apiClient";
const mockedApiClient = vi.mocked(apiClient, { deep: true });

vi.mock("../../services/toolUsageTracker", () => ({
  notifyToolCompleted: vi.fn(),
}));

vi.mock("../../services/fileStorage", () => ({
  onRecordUnreadable: () => () => {},
  fileStorage: {
    init: vi.fn().mockResolvedValue(undefined),
    storeFile: vi.fn(),
    storeStirlingFile: vi.fn().mockResolvedValue(undefined),
    persistVersionedOutputs: vi.fn().mockResolvedValue(undefined),
    deleteStirlingFile: vi.fn().mockResolvedValue(undefined),
    updateFileMetadata: vi.fn().mockResolvedValue(undefined),
    getAllFileMetadata: vi.fn().mockResolvedValue([]),
    cleanup: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/thumbnailGenerationService", () => ({
  thumbnailGenerationService: {
    generateThumbnail: vi.fn().mockResolvedValue("data:image/png;base64,x"),
    cleanup: vi.fn(),
    destroy: vi.fn(),
  },
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MantineProvider>
    <I18nextProvider i18n={i18n}>
      <PreferencesProvider>
        <ToolRegistryProvider>
          <NavigationProvider>
            <FileContextProvider>{children}</FileContextProvider>
          </NavigationProvider>
        </ToolRegistryProvider>
      </PreferencesProvider>
    </I18nextProvider>
  </MantineProvider>
);

afterEach(() => {
  cleanup();
  clearLockedDocumentAccess();
  vi.clearAllMocks();
});

describe("locked documents through useToolOperation", () => {
  test("timestamps a locked PDF with its password and keeps the output openable", async () => {
    // The signed result is still encrypted, as the backend returns it.
    const locked = { thumbnail: "", pageCount: 0, isEncrypted: true };
    vi.spyOn(thumbnailUtils, "generateThumbnailForFile").mockResolvedValue("");
    vi.spyOn(
      thumbnailUtils,
      "generateThumbnailPairWithMetadata",
    ).mockResolvedValue({ unrotated: locked, rotated: locked });
    mockedApiClient.post.mockResolvedValue({
      data: new Blob(["%PDF signed and still locked"]),
      status: 200,
      headers: {},
    });

    const input = createTestStirlingFile(
      "aadhaar.pdf",
      "%PDF encrypted",
      "application/pdf",
    );
    const { result } = renderHook(
      () => ({
        append: useToolOperation(timestampPdfOperationConfig),
        plain: useToolOperation({
          ...timestampPdfOperationConfig,
          lockedDocuments: undefined,
        }),
        context: useFileActions(),
        ...useFileState(),
      }),
      { wrapper: TestWrapper },
    );
    await act(async () => {
      result.current.context.dispatch({
        type: "ADD_FILES",
        payload: {
          stirlingFileStubs: [
            {
              ...createNewStirlingFileStub(input, input.fileId),
              // Past version 1, so the upload unlock prompt stays closed.
              versionNumber: 2,
              processedFile: { pages: [], isEncrypted: true },
            },
          ],
        },
      });
      setLockedDocumentAccess(input.fileId, {
        source: input,
        password: "typed",
        origin: "entered",
      });
    });

    expect(
      result.current.append.getEligibleFiles?.(defaultParameters, [input]),
    ).toEqual([input]);
    expect(
      result.current.plain.getEligibleFiles?.(defaultParameters, [input]),
    ).toEqual([]);

    await act(async () => {
      await result.current.append.executeOperation(defaultParameters, [input]);
    });

    expect(result.current.append.errorMessage).toBeNull();
    expect(mockedApiClient.post).toHaveBeenCalledTimes(1);
    const [url, body] = mockedApiClient.post.mock.calls[0];
    expect(url).toBe("/api/v1/security/timestamp-pdf");
    expect((body as FormData).get("fileInput")).toBe(input);
    expect((body as FormData).get("documentPassword")).toBe("typed");

    const outputId = result.current.state.files.ids.find(
      (id) => id !== input.fileId,
    );
    expect(outputId).toBeDefined();
    expect(getLockedDocumentAccess(outputId!)).toMatchObject({
      password: "typed",
      origin: "appended",
    });
    // A locked later version shows as locked; only a fresh upload opens the unlock prompt.
    expect(result.current.state.files.byId[outputId!].versionNumber).toBe(3);
    expect(isAwaitingUnlock(outputId!)).toBe(false);

    await act(async () => {
      await result.current.append.undoOperation();
    });

    expect(result.current.state.files.ids).toContain(input.fileId);
    expect(getLockedDocumentAccess(input.fileId)).toMatchObject({
      password: "typed",
      origin: "entered",
    });
  });
});
