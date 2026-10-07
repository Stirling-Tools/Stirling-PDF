import React, { useRef, useState } from "react";
import { Menu, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useIsPhone } from "@app/hooks/useIsMobile";
import { useProcessingFolderCreation } from "@app/hooks/useProcessingFolderCreation";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import MobileUploadModal from "@app/components/shared/MobileUploadModal";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { Logo } from "@app/ui/Logo";
import styles from "@app/components/fileEditor/AddFileCard.module.css";

interface AddFileCardProps {
  /** Receives files from the computer and mobile sources; the library adds its own. */
  onFilesSelected: (files: File[]) => void;
}

/**
 * The workbench's standing "add files" slot in the thumbnail grid. Add Files
 * opens the file library; the overflow menu holds the direct computer and
 * mobile uploads. Drops are handled by the surrounding workbench Dropzone,
 * whose drag state this card reflects.
 */
const AddFileCard = ({ onFilesSelected }: AddFileCardProps) => {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const { openFilesModal } = useFilesModalContext();
  const { config } = useAppConfig();
  const isPhone = useIsPhone();
  const folderCreation = useProcessingFolderCreation();
  const signedIn = usePoliciesEnabled();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mobileUploadOpen, setMobileUploadOpen] = useState(false);
  const moreOptionsLabel = t(
    "fileEditor.addCard.moreOptions",
    "More upload options",
  );

  const openComputerFiles = async () => {
    const files = await openFilesFromDisk({
      multiple: true,
      onFallbackOpen: () => fileInputRef.current?.click(),
    });
    if (files.length > 0) onFilesSelected(files);
  };

  const handleFallbackSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) onFilesSelected(files);
    event.target.value = "";
  };

  return (
    <div className={styles.cell}>
      <div className={styles.card} data-testid="add-file-card">
        <div className={styles.more}>
          <Menu position="bottom-end" withinPortal>
            {/* Tooltip outside the target: inside it, Mantine forwards the
                menu's aria-expanded/haspopup onto the tooltip element. */}
            <Tooltip label={moreOptionsLabel} withArrow>
              <Menu.Target>
                <ActionIcon
                  variant="tertiary"
                  accent="neutral"
                  size="sm"
                  aria-label={moreOptionsLabel}
                >
                  <Icon name="ellipsis" size="1.1rem" />
                </ActionIcon>
              </Menu.Target>
            </Tooltip>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="upload" size="1rem" />}
                onClick={() => void openComputerFiles()}
              >
                {t("fileEditor.addCard.fromComputer", "Upload from computer")}
              </Menu.Item>
              {config?.enableMobileScanner && !isPhone && (
                <Menu.Item
                  leftSection={<Icon name="qr-code" size="1rem" />}
                  onClick={() => setMobileUploadOpen(true)}
                >
                  {terminology.mobileUpload}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>

        <Logo variant="iconOnly" iconHeight="2.75rem" />

        <div className={styles.controls}>
          <div className={styles.actions}>
            <Button
              fat
              fullWidth
              leftSection={<Icon name="plus" size="1rem" />}
              onClick={() => openFilesModal()}
            >
              {terminology.addFiles}
            </Button>
            {folderCreation.open && (
              <Tooltip
                label={t(
                  "processingFolders.setup.signInRequired",
                  "Sign in to set up folder processing",
                )}
                disabled={signedIn}
                withArrow
              >
                {/* Wrapper keeps the tooltip on hover while the button is
                    disabled, since a disabled button takes no pointer events. */}
                <span className={styles.buttonWrap}>
                  <Button
                    fat
                    fullWidth
                    variant="secondary"
                    disabled={!signedIn}
                    leftSection={<Icon name="folder-plus" size="1rem" />}
                    onClick={() => folderCreation.open?.()}
                  >
                    {t("processingFolders.setup.title")}
                  </Button>
                </span>
              </Tooltip>
            )}
          </div>
          <div className={styles.hint}>
            {t("fileEditor.addCard.dropHint", "or drop files anywhere")}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFallbackSelect}
        style={{ display: "none" }}
      />
      <MobileUploadModal
        opened={mobileUploadOpen}
        onClose={() => setMobileUploadOpen(false)}
        onFilesReceived={onFilesSelected}
      />
      {folderCreation.dialog}
    </div>
  );
};

export default AddFileCard;
