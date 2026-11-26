import { useTranslation } from "react-i18next";
import { StirlingFileStub } from "@editor/types/fileContext";
import { PrivateContent } from "@editor/components/shared/PrivateContent";
import { FileNameInput } from "@editor/components/shared/FileNameInput";
import { truncateCenter } from "@editor/utils/textUtils";
import styles from "@editor/components/fileEditor/FileEditorThumbnail.module.css";

interface FileEditorFileNameProps {
  file: StirlingFileStub;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Gets the new full name. Rejecting keeps the field open with the message. */
  onRename: (name: string) => Promise<void>;
  maxLength?: number;
}

/** A file card's name; clicking it renames the file in place. */
const FileEditorFileName = ({
  file,
  editing,
  onEditingChange,
  onRename,
  maxLength = 40,
}: FileEditorFileNameProps) => {
  const { t } = useTranslation();

  if (editing) {
    return (
      <FileNameInput
        className={styles.fileNameInput}
        name={file.name}
        onRename={onRename}
        onClose={() => onEditingChange(false)}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.fileNameButton}
      aria-description={t("pageTracks.track.rename", "Rename file")}
      // The card opens the file on double-click and reacts to its own clicks.
      onClick={(event) => {
        event.stopPropagation();
        onEditingChange(true);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className={styles.fileNameText}>
        <PrivateContent>{truncateCenter(file.name, maxLength)}</PrivateContent>
      </span>
    </button>
  );
};

export default FileEditorFileName;
