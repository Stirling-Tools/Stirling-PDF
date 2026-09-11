import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import FileEditorThumbnail from "@app/components/fileEditor/FileEditorThumbnail";
import {
  createNewStirlingFileStub,
  type FileContextState,
} from "@app/types/fileContext";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";
import { initialFileContextState } from "@app/contexts/file/FileReducer";
import type { FileItemPolicyRef } from "@app/components/shared/PolicyBadges";

const file = createTestStirlingFile("report.pdf");
const stub = createNewStirlingFileStub(file, file.fileId);
const reRunPolicy = vi.fn();
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useFileContext: () => ({
    activeFiles: [file],
    isFilePinned: () => false,
    actions: {},
  }),
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileSelector: <T,>(selector: (state: FileContextState) => T) =>
    selector(initialFileContextState),
  useFileSelectors: () => ({}),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: {} }),
}));
vi.mock("@app/hooks/usePolicyRecovery", () => ({
  usePolicyRecovery: () => ({ reRunPolicy }),
}));
vi.mock("@app/hooks/useFileThumbnail", () => ({
  useFileThumbnail: () => ({
    isEncrypted: false,
    thumbnail: "report.png",
    isGenerating: false,
  }),
}));
vi.mock("@app/hooks/useIsMobile", () => ({ useIsMobile: () => true }));
vi.mock("@app/components/shared/PrivateContent", () => ({
  PrivateContent: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/components/filesPage/VersionHistoryModal", () => ({
  VersionHistoryModal: () => null,
}));
vi.mock("@app/components/shared/UploadToServerModal", () => ({
  default: () => null,
}));
vi.mock("@app/components/shared/ShareFileModal", () => ({
  default: () => null,
}));
vi.mock("@atlaskit/pragmatic-drag-and-drop/element/adapter", () => ({
  draggable: () => () => {},
  dropTargetForElements: () => () => {},
}));

describe("blocked active file thumbnails", () => {
  it("dims blocked files without an open tool and keeps retry and close available", async () => {
    const onViewFile = vi.fn();
    const policies: FileItemPolicyRef[] = [
      {
        id: "security",
        name: "Security",
        accentColor: "var(--c-primary)",
        blocked: true,
      },
    ];
    const renderCard = (policies: FileItemPolicyRef[]) => (
      <MantineProvider>
        <FileEditorThumbnail
          file={stub}
          index={0}
          totalFiles={1}
          policies={policies}
          onViewFile={onViewFile}
          onCloseFile={vi.fn()}
          onDownloadFile={vi.fn()}
        />
      </MantineProvider>
    );
    const view = render(renderCard(policies));
    const card = screen.getByTestId("file-thumbnail");
    expect(card).toHaveAttribute("data-policy-blocked", "true");
    expect(card).toHaveAccessibleDescription(/A required policy failed/);
    await userEvent.dblClick(card);
    expect(onViewFile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Re-run policy" }),
    );
    expect(reRunPolicy).toHaveBeenCalledWith(file.fileId);

    view.rerender(renderCard([]));
    expect(card).toHaveAttribute("data-policy-blocked", "false");
    expect(card).not.toHaveAttribute("aria-disabled");
    await userEvent.dblClick(card);
    expect(onViewFile).toHaveBeenCalledWith(file.fileId);
  });
});
