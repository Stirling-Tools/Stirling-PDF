import { useTranslation } from "react-i18next";
import { StirlingFileStub } from "@editor/types/fileContext";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
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
      // Private on the button itself: its label carries the name too.
      className={`${privateContentClassName} ${styles.fileNameButton}`}
      aria-label={t("fileSidebar.rename.action", "Rename {{name}}", {
        name: file.name,
      })}
      // The card opens the file on double-click and reacts to its own clicks.
      onClick={(event) => {
        event.stopPropagation();
        onEditingChange(true);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className={styles.fileNameText}>
        {truncateCenter(file.name, maxLength)}
      </span>
    </button>
  );
};

export default FileEditorFileName;
