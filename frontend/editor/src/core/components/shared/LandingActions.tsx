import React from "react";
import { Group, Tooltip } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useIsMobile } from "@app/hooks/useIsMobile";

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
  const icons = useFileActionIcons();
  const { config } = useAppConfig();
  const isMobile = useIsMobile();

  return (
    <>
      <Group gap="sm" justify="center" wrap="wrap" mb="xs">
        <Button
          className="landing-btn-primary"
          leftSection={
            <LocalIcon icon={icons.uploadIconName} width="1rem" height="1rem" />
          }
          onClick={(e) => {
            e.stopPropagation();
            onUploadClick();
          }}
        >
          {terminology.uploadFromComputer}
        </Button>

        <Button
          variant="secondary"
          className="landing-btn-secondary"
          leftSection={
            <LocalIcon icon="add" width="1rem" height="1rem" />
          }
          onClick={(e) => {
            e.stopPropagation();
            openFilesModal();
          }}
        >
          {terminology.addFiles}
        </Button>

        {config?.enableMobileScanner && !isMobile && (
          <Tooltip label={terminology.mobileUpload} position="bottom">
            <ActionIcon
              size="lg"
              variant="secondary"
              aria-label={terminology.mobileUpload}
              className="landing-btn-secondary landing-btn-icon"
              onClick={(e) => {
                e.stopPropagation();
                onMobileUploadClick();
              }}
            >
              <LocalIcon
                icon="qr-code-rounded"
                width="1.25rem"
                height="1.25rem"
              />
            </ActionIcon>
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
