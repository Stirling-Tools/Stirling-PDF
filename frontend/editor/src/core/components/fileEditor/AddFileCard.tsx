import React, { useRef, useState } from "react";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useProcessingFolderCreation } from "@app/hooks/useProcessingFolderCreation";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import MobileUploadModal from "@app/components/shared/MobileUploadModal";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";
import { Icon, type IconName } from "@app/ui/Icon";
import { Logo } from "@app/ui/Logo";
import styles from "@app/components/fileEditor/AddFileCard.module.css";

interface AddFileCardProps {
  /** Receives files from the computer and mobile sources; the library adds its own. */
  onFilesSelected: (files: File[]) => void;
}

interface SourceProps {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

function Source({ icon, label, disabled, onSelect }: SourceProps) {
  return (
    <button
      type="button"
      className={styles.source}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <Icon name={icon} size="0.95rem" />
      {label}
    </button>
  );
}

function SheetLines() {
  return (
    <span className={styles.lines} aria-hidden>
      <span style={{ width: "55%" }} />
      <span style={{ width: "90%" }} />
      <span style={{ width: "80%" }} />
      <span style={{ width: "86%" }} />
      <span style={{ width: "40%" }} />
    </span>
  );
}

/**
 * The workbench's standing "add files" slot: a page stack in the thumbnail grid.
 * Clicking the page opens the file library; hovering or focusing it
 * reveals the other sources. Drops are handled by the surrounding workbench
 * Dropzone, whose drag state this card reflects.
 */
const AddFileCard = ({ onFilesSelected }: AddFileCardProps) => {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const { openFilesModal } = useFilesModalContext();
  const { config } = useAppConfig();
  const isMobile = useIsMobile();
  const folderCreation = useProcessingFolderCreation();
  const signedIn = usePoliciesEnabled();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mobileUploadOpen, setMobileUploadOpen] = useState(false);

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
      <div className={styles.stack}>
        <span
          className={`${styles.sheet} ${styles.backSheet} ${styles.backLeft}`}
        >
          <SheetLines />
        </span>
        <span
          className={`${styles.sheet} ${styles.backSheet} ${styles.backRight}`}
        >
          <SheetLines />
        </span>
        {/* Pointer shortcut only: keyboard users reach the library through its
            source button, so the sheet itself is not a control. */}
        <div
          className={`${styles.sheet} ${styles.frontSheet}`}
          data-testid="add-file-card"
          onClick={() => openFilesModal()}
        >
          <SheetLines />
          <span className={styles.logo} aria-hidden>
            <Logo
              variant="iconAndText"
              iconHeight="1.6rem"
              textHeight="1.05rem"
            />
          </span>
          <span className={styles.plus} aria-hidden>
            <Icon name="plus" size="1.75rem" />
          </span>
          <div
            className={styles.sources}
            role="group"
            aria-label={terminology.addFiles}
          >
            <Source
              icon="upload"
              label={t("fileEditor.addCard.fromComputer", "From computer")}
              onSelect={() => void openComputerFiles()}
            />
            <Source
              icon="library"
              label={t("fileEditor.addCard.fromLibrary", "From library")}
              onSelect={() => openFilesModal()}
            />
            {config?.enableMobileScanner && !isMobile && (
              <Source
                icon="qr-code"
                label={t("fileEditor.addCard.fromMobile", "From mobile")}
                onSelect={() => setMobileUploadOpen(true)}
              />
            )}
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
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <Source
                    icon="folder-plus"
                    label={t("processingFolders.setup.title")}
                    disabled={!signedIn}
                    onSelect={() => folderCreation.open?.()}
                  />
                </span>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      <div className={styles.title}>{terminology.addFiles}</div>
      <div className={styles.hint}>
        {t("fileEditor.addCard.hint", "Click or drop to add more")}
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
