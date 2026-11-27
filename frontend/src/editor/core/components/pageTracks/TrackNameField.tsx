import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { PrivateContent } from "@editor/components/shared/PrivateContent";
import { FileNameInput } from "@editor/components/shared/FileNameInput";
import { truncateCenter } from "@editor/utils/textUtils";
import styles from "@editor/components/pageTracks/PageTracks.module.css";

interface TrackNameFieldProps {
  name: string;
  /** Gets the new full name. Rejecting keeps the field open with the message. */
  onRename: (name: string) => Promise<void>;
}

/** A track's name, renamed in place from its pencil button. */
export function TrackNameField({ name, onRename }: TrackNameFieldProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <FileNameInput
        className={styles.trackNameInput}
        name={name}
        onRename={onRename}
        onClose={() => setEditing(false)}
      />
    );
  }

  const renameLabel = t("pageTracks.track.rename", "Rename file");
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
          onClick={() => setEditing(true)}
        >
          <Icon name="pencil" size="1rem" />
        </ActionIcon>
      </Tooltip>
    </>
  );
}
