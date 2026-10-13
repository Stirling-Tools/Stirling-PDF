import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Input } from "@app/ui/Input";
import { Tooltip } from "@app/components/shared/Tooltip";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { truncateCenter } from "@app/utils/textUtils";
import { ILLEGAL_FILE_NAME_CHARS, splitFileName } from "@app/utils/fileUtils";
import styles from "@app/components/pageTracks/PageTracks.module.css";

interface TrackNameFieldProps {
  name: string;
  /** Gets the new full name. Rejecting keeps the field open with the message. */
  onRename: (name: string) => Promise<void>;
}

/**
 * A track's name, renamed in place. Only the base name is editable: the
 * extension stays fixed so a rename can't leave the file claiming the wrong
 * type. Enter or blur commits, Escape cancels.
 */
export function TrackNameField({ name, onRename }: TrackNameFieldProps) {
  const { t } = useTranslation();
  const [base, extension] = splitFileName(name);
  // null while not editing.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: Enter commits and the blur that follows must see it set
  // within the same tick.
  const committing = useRef(false);

  const stopEditing = () => {
    setDraft(null);
    setError(null);
  };

  const commit = async () => {
    if (draft === null || committing.current) return;
    const nextBase = draft.trim();
    const nextName = `${nextBase}${extension}`;
    if (!nextBase || nextName === name) {
      stopEditing();
      return;
    }
    if (ILLEGAL_FILE_NAME_CHARS.test(nextBase)) {
      setError(
        t(
          "fileSidebar.rename.illegalCharacters",
          "A file name can't contain \\ / : * ? \" < > |",
        ),
      );
      return;
    }
    committing.current = true;
    try {
      await onRename(nextName);
      stopEditing();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("fileSidebar.rename.error", "Could not rename the file."),
      );
    } finally {
      committing.current = false;
    }
  };

  const renameLabel = t("pageTracks.track.rename", "Rename file");

  if (draft === null) {
    return (
      <>
        <span className={styles.trackName}>
          <PrivateContent>{truncateCenter(name, 40)}</PrivateContent>
        </span>
        <Tooltip position="bottom" content={renameLabel}>
          <ActionIcon
            className={styles.trackLeadAction}
            variant="quiet"
            size="sm"
            aria-label={renameLabel}
            onClick={() => setDraft(base)}
          >
            <Icon name="pencil" size="1rem" />
          </ActionIcon>
        </Tooltip>
      </>
    );
  }

  return (
    <Tooltip position="bottom" content={error} open={error != null}>
      <Input
        className={styles.trackNameInput}
        inputSize="sm"
        autoFocus
        value={draft}
        invalid={error != null}
        maxLength={200}
        aria-label={t("fileSidebar.rename.label", "File name")}
        aria-invalid={error != null}
        trailingIcon={extension || undefined}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setError(null);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => void commit()}
        // The header is the track's drag handle; selecting text must not drag it.
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            stopEditing();
          }
        }}
      />
    </Tooltip>
  );
}
