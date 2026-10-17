import { Menu, Popover } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { useAllFiles, useFileActions } from "@app/contexts/file/fileHooks";
import { useViewer } from "@app/contexts/ViewerContext";
import { SearchInterface } from "@app/components/viewer/SearchInterface";
import { NotificationBell } from "@app/components/notifications/NotificationBell";
import { canShareFiles, shareFiles } from "@app/services/downloadService";
import { downloadFileWithPolicy } from "@app/services/exportWithPolicy";
import { alert } from "@app/components/toast";

interface DocumentHeaderProps {
  onBack: () => void;
}

/** Top bar of the document screen: back to documents, which file, and what to do with it. */
export function DocumentHeader({ onBack }: DocumentHeaderProps) {
  const { t } = useTranslation();
  const { files, fileStubs } = useAllFiles();
  const { actions: fileActions } = useFileActions();
  const viewer = useViewer();

  const current =
    fileStubs.find((stub) => stub.id === viewer.activeFileId) ?? fileStubs[0];
  const currentFile = files.find((file) => file.fileId === current?.id);
  const shareable = currentFile ? canShareFiles([currentFile]) : false;

  const save = async () => {
    if (!current) return;
    // Export first so annotations and edits made in the viewer are included.
    const buffer = await viewer.exportActions.saveAsCopy();
    if (!buffer) return;
    const result = await downloadFileWithPolicy({
      data: new Blob([buffer], { type: "application/pdf" }),
      filename: current.name,
      fileId: current.id,
    });
    if (result.savedPath) {
      fileActions.updateStirlingFileStub(current.id, { isDirty: false });
    }
  };

  // Called straight from the tap: the share sheet needs that gesture's activation.
  const share = () => {
    if (!currentFile) return;
    void shareFiles([currentFile], current?.name).then((result) => {
      if (result.status === "failed") {
        alert({
          alertType: "error",
          title: t("mobile.document.shareFailed", "Couldn't share this file"),
          body: result.error,
          isPersistentPopup: false,
        });
      }
    });
  };

  return (
    <header className="document-header">
      <ActionIcon
        variant="tertiary"
        aria-label={t("mobile.document.back", "Documents")}
        onClick={onBack}
      >
        <Icon name="arrow-left" size="1.4rem" />
      </ActionIcon>

      {fileStubs.length > 1 ? (
        <Menu position="bottom" width={260}>
          <Menu.Target>
            <button
              type="button"
              className="document-header-title"
              aria-label={t("mobile.document.switch", "Switch document")}
            >
              <span className="document-header-name">{current?.name}</span>
              <Icon name="chevron-down" size="1rem" />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            {fileStubs.map((stub) => (
              <Menu.Item
                key={stub.id}
                onClick={() => viewer.setActiveFileId(stub.id)}
                rightSection={
                  stub.id === current?.id ? (
                    <Icon name="check" size="1rem" />
                  ) : null
                }
              >
                {stub.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      ) : (
        <span className="document-header-title">
          <span className="document-header-name">{current?.name}</span>
        </span>
      )}

      <Popover
        position="bottom-end"
        shadow="md"
        opened={viewer.isSearchInterfaceVisible}
        onClose={viewer.searchInterfaceActions.close}
      >
        <Popover.Target>
          <ActionIcon
            variant="tertiary"
            aria-label={t("mobile.document.search", "Search in document")}
            onClick={viewer.searchInterfaceActions.toggle}
          >
            <Icon name="search" size="1.25rem" />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <SearchInterface
            visible={viewer.isSearchInterfaceVisible}
            onClose={viewer.searchInterfaceActions.close}
          />
        </Popover.Dropdown>
      </Popover>

      {shareable ? (
        <ActionIcon
          variant="tertiary"
          aria-label={t("mobile.document.share", "Share")}
          onClick={share}
        >
          <Icon name="share" size="1.25rem" />
        </ActionIcon>
      ) : (
        <ActionIcon
          variant="tertiary"
          aria-label={t("mobile.document.save", "Save to device")}
          onClick={() => void save()}
        >
          <Icon name="download" size="1.25rem" />
        </ActionIcon>
      )}

      <Menu position="bottom-end" width={220}>
        <Menu.Target>
          <ActionIcon
            variant="tertiary"
            aria-label={t("workbenchBar.moreActions", "More actions")}
          >
            <Icon name="ellipsis-vertical" size="1.25rem" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="download" size="1.1rem" />}
            onClick={() => void save()}
          >
            {t("mobile.document.save", "Save to device")}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <NotificationBell />
    </header>
  );
}
