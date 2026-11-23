import React from "react";
import { Group, Menu, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { Spinner } from "@editor/ui/Spinner";
import { useFilesModalContext } from "@editor/contexts/FilesModalContext";
import { useFilesPage } from "@editor/contexts/FilesPageContext";
import { useFolders } from "@editor/contexts/FolderContext";
import { useFileActionTerminology } from "@editor/hooks/useFileActionTerminology";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import { CreateProcessingFolderButton } from "@editor/components/policies/CreateProcessingFolderButton";
import { folderKind } from "@editor/types/folder";
import { useCreatePdfMenu } from "@editor/components/createPdf/useCreatePdfMenu";
import { CreatePdfMenuItems } from "@editor/components/createPdf/CreatePdfMenuItems";

type LandingActionsProps = {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUploadClick: () => void;
  onMobileUploadClick: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function LandingActions({
  fileInputRef,
  onUploadClick,
  onMobileUploadClick,
  onFileSelect,
}: LandingActionsProps) {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const createPdf = useCreatePdfMenu();
  const { openFilesModal } = useFilesModalContext();
  const { allFiles, loading } = useFilesPage();
  const folders = useFolders();
  const { config } = useAppConfig();
  const isMobile = useIsMobile();
  // Mounted directories are listed on demand, so their files may not be cached yet.
  const hasMountedFolders = folders.folders.some(
    (folder) => folderKind(folder) === "local",
  );
  const libraryEmpty =
    !loading && !folders.loading && allFiles.length === 0 && !hasMountedFolders;

  return (
    <>
      <Group gap="sm" justify="center" wrap="wrap" mb="xs">
        <Button
          fat
          leftSection={<Icon name="plus" size="1rem" />}
          onClick={(e) => {
            e.stopPropagation();
            if (libraryEmpty) {
              onUploadClick();
            } else {
              openFilesModal();
            }
          }}
        >
          {terminology.addFiles}
        </Button>

        <Menu
          position="bottom"
          withinPortal
          shadow="md"
          width={300}
          disabled={createPdf.busyLabel !== null}
        >
          <Menu.Target>
            <Button
              variant="secondary"
              fat
              aria-busy={createPdf.busyLabel !== null}
              leftSection={
                createPdf.busyLabel ? (
                  <Spinner size="xs" />
                ) : (
                  <Icon name="file-plus" size="1rem" />
                )
              }
              rightSection={
                createPdf.busyLabel ? null : (
                  <Icon name="chevron-down" size="0.875rem" />
                )
              }
              onClick={(e) => e.stopPropagation()}
              data-testid="landing-create-pdf"
            >
              {createPdf.busyLabel ?? t("createPdf.button", "Create PDF")}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <CreatePdfMenuItems items={createPdf.items} />
          </Menu.Dropdown>
        </Menu>

        <CreateProcessingFolderButton />

        {config?.enableMobileScanner && !isMobile && (
          <Tooltip label={terminology.mobileUpload} position="bottom">
            <Button
              variant="secondary"
              fat
              aria-label={terminology.mobileUpload}
              onClick={(e) => {
                e.stopPropagation();
                onMobileUploadClick();
              }}
              leftSection={<Icon name="qr-code" size="1.25rem" />}
            />
          </Tooltip>
        )}
      </Group>
      {createPdf.dialogs}
      <input
        ref={fileInputRef}
        data-testid="landing-file-input"
        type="file"
        multiple
        onChange={onFileSelect}
        style={{ display: "none" }}
      />
    </>
  );
}
