import React from "react";
import { Group } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { Wordmark } from "@app/components/shared/Wordmark";
import styles from "@app/components/fileEditor/FileEditor.module.css";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { Icon } from "@app/ui/Icon";

const AddFileCard = () => {
  const { t } = useTranslation();
  const { openFilesModal } = useFilesModalContext();
  const terminology = useFileActionTerminology();

  const handleCardClick = () => {
    openFilesModal();
  };

  const handleOpenFilesModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    openFilesModal();
  };

  return (
    <div
      className={`${styles.addFileCard} select-none flex flex-col relative cursor-pointer`}
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
      <div className={styles.addFileContent}>
        <Group gap="xs" align="center">
          <Wordmark
            alt="Stirling PDF"
            muted
            style={{ height: "2.2rem", width: "auto" }}
          />
        </Group>

        <Button
          variant="tertiary"
          style={{
            backgroundColor: "var(--landing-button-bg)",
            color: "var(--c-accent-fg)",
            border: "1px solid var(--landing-button-border)",
            borderRadius: "2rem",
            height: "38px",
            paddingLeft: "1rem",
            paddingRight: "1rem",
            width: "100%",
            marginTop: "0.8rem",
            marginBottom: "0.8rem",
          }}
          onClick={handleOpenFilesModal}
        >
          <Icon name="plus" size="1.5rem" className="text-[var(--c-primary)]" />
          <span>{terminology.addFiles}</span>
        </Button>

        <span
          style={{
            fontSize: ".8rem",
            textAlign: "center",
            marginTop: "0.5rem",
            color: "var(--c-text-muted)",
          }}
        >
          {terminology.dropFilesHere}
        </span>
      </div>
    </div>
  );
};

export default AddFileCard;
