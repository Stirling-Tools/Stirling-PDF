import { useState } from "react";
import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@app/ui/Icon";
import { BarButton } from "@app/components/viewer/ViewerBarControls";
import { RenameFileDialog } from "@app/components/shared/RenameFileDialog";
import { VersionHistoryModal } from "@app/components/filesPage/VersionHistoryModal";
import { alert } from "@app/components/toast";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { duplicateStoredFile } from "@app/utils/duplicateFile";
import { useCloseViewerFile } from "@app/components/viewer/useCloseViewerFile";
import { useAllFiles, useFileActions } from "@app/contexts/FileContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { fileStorage } from "@app/services/fileStorage";
import type { FileId } from "@app/types/file";
import type { ToolId } from "@app/types/toolId";

type ShownFile = File & { fileId?: FileId };

/**
 * Everything done to the document as a whole, rather than to what is on its
 * pages: naming, copying and tracing it, reading and editing its properties, protecting or
 * shrinking it, reworking its pages, and closing it.
 */
export function ViewerDocumentMenu({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const { files, fileStubs } = useAllFiles();
  const { actions: fileActions } = useFileActions();
  const { activeFileId } = useViewer();
  const { handleToolSelect } = useToolWorkflow();
  const { actions: navigation } = useNavigationActions();
  const closeFile = useCloseViewerFile();
  const [renaming, setRenaming] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const indexedDB = useIndexedDB();
  const { addFiles } = useFileHandler();

  // The viewer shows the first file until one is picked.
  const shown = (files.find((f) => (f as ShownFile).fileId === activeFileId) ??
    files[0]) as ShownFile | undefined;
  const fileId = shown?.fileId;
  const stub = fileStubs.find((s) => s.id === fileId);

  const rename = async (name: string) => {
    if (!fileId || !shown) return;
    // quickKey is name|size|lastModified; a stale one would make a re-upload
    // of the original look like a duplicate of the renamed file.
    const quickKey = `${name}|${shown.size}|${shown.lastModified}`;
    const saved = await fileStorage.updateFileMetadata(fileId, {
      name,
      quickKey,
    });
    if (!saved) {
      throw new Error(
        t("fileSidebar.rename.error", "Could not rename the file."),
      );
    }
    fileActions.updateStirlingFileStub(fileId, { name, quickKey });
    setRenaming(false);
  };

  // The copy goes to the library beside the original, as the library's own
  // Duplicate does, so the toast says where to find it.
  const duplicate = async () => {
    if (!stub) return;
    try {
      const library = await indexedDB.loadLeafMetadata();
      const copyId = await duplicateStoredFile(
        stub,
        library.map((s) => s.name),
        addFiles,
      );
      if (!copyId) {
        alert({
          alertType: "warning",
          title: t("fileSidebar.dataLostTitle", "File data is unavailable"),
          expandable: false,
        });
        return;
      }
      alert({
        alertType: "success",
        title: t(
          "workbenchBar.docMenu.duplicated",
          "Copy saved to your PDF library",
        ),
        expandable: false,
      });
    } catch (error) {
      alert({
        alertType: "error",
        title: t("fileSidebar.duplicateFailed", "Could not duplicate file"),
        body: error instanceof Error ? error.message : String(error),
        expandable: false,
      });
    }
  };

  const tool = (icon: IconName, toolId: ToolId, label: string) => (
    <Menu.Item
      leftSection={<Icon name={icon} size="1rem" />}
      onClick={() => handleToolSelect(toolId)}
      data-testid={`viewer-doc-menu-${toolId}`}
    >
      {label}
    </Menu.Item>
  );

  const moreLabel = t("workbenchBar.docMenu.more", "More document actions");

  return (
    <>
      <Menu shadow="md" position="bottom-end" withinPortal>
        <Menu.Target>
          <BarButton
            icon="ellipsis-vertical"
            label={moreLabel}
            iconOnly
            disabled={disabled || !fileId}
            testId="viewer-doc-menu"
          />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>
            {t("workbenchBar.docMenu.document", "Document")}
          </Menu.Label>
          <Menu.Item
            leftSection={<Icon name="pencil" size="1rem" />}
            onClick={() => setRenaming(true)}
            data-testid="viewer-doc-menu-rename"
          >
            {t("workbenchBar.docMenu.rename", "Rename…")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="copy" size="1rem" />}
            onClick={() => void duplicate()}
            data-testid="viewer-doc-menu-duplicate"
          >
            {t("fileSidebar.fileItem.duplicate", "Duplicate")}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="rotate-ccw-clock" size="1rem" />}
            disabled={(stub?.versionNumber ?? 1) <= 1}
            onClick={() => setShowingHistory(true)}
            data-testid="viewer-doc-menu-history"
          >
            {t("fileSidebar.fileItem.versionHistory", "Version history")}
          </Menu.Item>
          {tool(
            "info",
            "getPdfInfo",
            t("workbenchBar.docMenu.info", "Document info"),
          )}
          {tool(
            "file-pen",
            "changeMetadata",
            t("workbenchBar.docMenu.metadata", "Edit properties"),
          )}
          <Menu.Divider />
          <Menu.Label>
            {t("workbenchBar.docMenu.protect", "Protect and optimise")}
          </Menu.Label>
          {tool(
            "lock",
            "addPassword",
            t("workbenchBar.docMenu.password", "Add password"),
          )}
          {tool(
            "shrink",
            "compress",
            t("workbenchBar.docMenu.compress", "Compress"),
          )}
          <Menu.Divider />
          <Menu.Item
            leftSection={<Icon name="layout-grid" size="1rem" />}
            onClick={() => navigation.setWorkbench("pageEditor")}
            data-testid="viewer-doc-menu-pages"
          >
            {t("workbenchBar.docMenu.pages", "Edit pages")}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<Icon name="x" size="1rem" />}
            onClick={() => fileId && closeFile(fileId)}
            data-testid="viewer-doc-menu-close"
          >
            {t("workbenchBar.docMenu.close", "Close document")}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <VersionHistoryModal
        opened={showingHistory}
        onClose={() => setShowingHistory(false)}
        file={showingHistory ? (stub ?? null) : null}
      />
      <RenameFileDialog
        opened={renaming}
        fileName={
          fileStubs.find((s) => s.id === fileId)?.name ?? shown?.name ?? ""
        }
        onClose={() => setRenaming(false)}
        onSubmit={rename}
      />
    </>
  );
}
