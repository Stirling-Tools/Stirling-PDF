import { useState } from "react";
import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@editor/ui/Icon";
import { BarButton } from "@editor/components/viewer/ViewerBarControls";
import { RenameFileDialog } from "@editor/components/shared/RenameFileDialog";
import { VersionHistoryModal } from "@editor/components/filesPage/VersionHistoryModal";
import { alert } from "@editor/components/toast";
import { useIndexedDB } from "@editor/contexts/IndexedDBContext";
import { useFileHandler } from "@editor/hooks/useFileHandler";
import { duplicateStoredFile } from "@editor/utils/duplicateFile";
import { renameStoredFile } from "@editor/services/renameStoredFile";
import { useCloseViewerDocument } from "@editor/components/viewer/useCloseViewerDocument";
import { useAllFiles, useFileActions } from "@editor/contexts/FileContext";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import type { ToolId } from "@editor/types/toolId";

/**
 * Everything done to the document as a whole rather than to its pages: naming,
 * copying and tracing it, its properties, protecting or shrinking it, reworking
 * its pages, and closing it.
 */
export function ViewerDocumentMenu({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const { fileStubs } = useAllFiles();
  const { actions: fileActions } = useFileActions();
  const { activeFileId } = useViewer();
  const { handleToolSelect } = useToolWorkflow();
  const closeDocument = useCloseViewerDocument();
  const indexedDB = useIndexedDB();
  const { addFiles } = useFileHandler();
  const [renaming, setRenaming] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The viewer shows the first file until one is picked.
  const stub =
    fileStubs.find((s) => s.id === activeFileId) ?? fileStubs[0] ?? null;

  const rename = async (name: string) => {
    if (!stub) return;
    const saved = await renameStoredFile(
      stub,
      name,
      fileActions.updateStirlingFileStub,
    );
    if (!saved) {
      throw new Error(
        t("fileSidebar.rename.error", "Could not rename the file."),
      );
    }
    setRenaming(false);
  };

  // The copy goes to the library, not the workbench, so the toast says where.
  const duplicate = async () => {
    if (!stub) return;
    try {
      const library = await indexedDB.loadLeafMetadata();
      const copyId = await duplicateStoredFile(
        stub,
        library.map((s) => s.name),
        addFiles,
      );
      alert(
        copyId
          ? {
              alertType: "success",
              title: t(
                "workbenchBar.docMenu.duplicated",
                "Copy saved to your file library",
              ),
              expandable: false,
            }
          : {
              alertType: "warning",
              title: t("fileSidebar.dataLostTitle", "File data is unavailable"),
              expandable: false,
            },
      );
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

  return (
    <>
      <Menu
        shadow="md"
        position="bottom-end"
        withinPortal
        opened={menuOpen}
        onChange={setMenuOpen}
      >
        <Menu.Target>
          <BarButton
            icon="ellipsis-vertical"
            label={t("workbenchBar.docMenu.more", "More document actions")}
            iconOnly
            tooltipDisabled={menuOpen}
            disabled={disabled || !stub}
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
          {tool("signature", "sign", t("workbenchBar.docMenu.sign", "Sign"))}
          <Menu.Divider />
          <Menu.Item
            leftSection={<Icon name="x" size="1rem" />}
            onClick={() => void closeDocument()}
            data-testid="viewer-doc-menu-close"
          >
            {t("workbenchBar.docMenu.close", "Close document")}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <VersionHistoryModal
        opened={showingHistory}
        onClose={() => setShowingHistory(false)}
        file={showingHistory ? stub : null}
      />
      <RenameFileDialog
        opened={renaming}
        fileName={stub?.name ?? ""}
        onClose={() => setRenaming(false)}
        onSubmit={rename}
      />
    </>
  );
}
