import React from "react";
import { Group, Tooltip } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useFolders } from "@app/contexts/FolderContext";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { CreateProcessingFolderButton } from "@app/components/policies/CreateProcessingFolderButton";
import { folderKind } from "@app/types/folder";

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
  const terminology = useFileActionTerminology();
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
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={onFileSelect}
        style={{ display: "none" }}
      />
    </>
  );
}
