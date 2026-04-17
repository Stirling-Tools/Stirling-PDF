import React from "react";
import { Button, Group, Tooltip, ActionIcon } from "@mantine/core";
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
          classNames={{ root: "landing-btn-primary" }}
          leftSection={
            <LocalIcon
              icon={icons.uploadIconName}
              width="1rem"
              height="1rem"
              style={{ color: "white" }}
            />
          }
          onClick={(e) => {
            e.stopPropagation();
            onUploadClick();
          }}
        >
          {terminology.uploadFromComputer}
        </Button>

        <Button
          variant="default"
          classNames={{ root: "landing-btn-secondary" }}
          leftSection={
            <LocalIcon
              icon="add"
              width="1rem"
              height="1rem"
              className="text-[var(--accent-interactive)]"
            />
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
              variant="default"
              radius="md"
              aria-label={terminology.mobileUpload}
              classNames={{ root: "landing-btn-secondary landing-btn-icon" }}
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
