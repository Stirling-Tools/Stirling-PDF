import React, { useRef, useState } from "react";
import { Button, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Wordmark } from "@app/components/shared/Wordmark";
import styles from "@app/components/fileEditor/FileEditor.module.css";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";

interface AddFileCardProps {
  onFileSelect: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
}

const AddFileCard = ({
  onFileSelect,
  accept,
  multiple = true,
}: AddFileCardProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openFilesModal } = useFilesModalContext();
  const [isUploadHover, setIsUploadHover] = useState(false);
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();

  const handleCardClick = () => {
    openFilesModal();
  };

  const handleNativeUploadClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const files = await openFilesFromDisk({
      multiple,
      onFallbackOpen: () => fileInputRef.current?.click(),
    });
    if (files.length > 0) {
      onFileSelect(files);
    }
  };

  const handleOpenFilesModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    openFilesModal();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      onFileSelect(files);
    }
    // Reset input so same files can be selected again
    event.target.value = "";
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <div
        className={`${styles.addFileCard} select-none flex flex-col transition-all relative cursor-pointer`}
        tabIndex={0}
        role="button"
        aria-label={t("fileEditor.addFiles", "Add files")}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick();
          }
        }}
      >
        {/* Main content area */}
        <div className={styles.addFileContent}>
          {/* Stirling PDF Branding */}
          <Group gap="xs" align="center">
            <Wordmark
              alt="Stirling PDF"
              muted
              style={{ height: "2.2rem", width: "auto" }}
            />
          </Group>

          {/* Add Files + Native Upload Buttons - styled like LandingPage */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.6rem",
              width: "100%",
              marginTop: "0.8rem",
              marginBottom: "0.8rem",
            }}
            onMouseLeave={() => setIsUploadHover(false)}
          >
            {!isUploadHover && (
              <Button
                style={{
                  backgroundColor: "var(--landing-button-bg)",
                  color: "var(--landing-button-color)",
                  border: "1px solid var(--landing-button-border)",
                  borderRadius: "2rem",
                  height: "38px",
                  paddingLeft: "1rem",
                  paddingRight: "1rem",
                  width: "calc(100% - 58px - 0.6rem)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "width .5s ease, padding .5s ease",
                }}
                onClick={handleOpenFilesModal}
                onMouseEnter={() => setIsUploadHover(false)}
              >
                <LocalIcon
                  icon="add"
                  width="1.5rem"
                  height="1.5rem"
                  className="text-[var(--accent-interactive)]"
                />
                <span>{t("landing.addFiles", "Add Files")}</span>
              </Button>
            )}
            <Button
              aria-label={t("addFileCard.upload", "Upload")}
              title={terminology.uploadFromComputer}
              style={{
                backgroundColor: "var(--landing-button-bg)",
                color: "var(--landing-button-color)",
                border: "1px solid var(--landing-button-border)",
                borderRadius: "1rem",
                height: "38px",
                width: isUploadHover ? "100%" : "58px",
                minWidth: "58px",
                paddingLeft: isUploadHover ? "1rem" : 0,
                paddingRight: isUploadHover ? "1rem" : 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "width .5s ease, padding .5s ease",
                overflow: "hidden",
              }}
              onClick={handleNativeUploadClick}
              onMouseEnter={() => setIsUploadHover(true)}
            >
              <LocalIcon
                icon={icons.uploadIconName}
                width="1.25rem"
                height="1.25rem"
                style={{ color: "var(--accent-interactive)", flexShrink: 0 }}
              />
              {isUploadHover && (
                <span
                  style={{
                    marginLeft: ".5rem",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}
                >
                  {terminology.uploadFromComputer}
                </span>
              )}
            </Button>
          </div>

          {/* Instruction Text */}
          <span
            className="text-[var(--accent-interactive)]"
            style={{
              fontSize: ".8rem",
              textAlign: "center",
              marginTop: "0.5rem",
            }}
          >
            {terminology.dropFilesHere}
          </span>
        </div>
      </div>
    </>
  );
};

export default AddFileCard;
