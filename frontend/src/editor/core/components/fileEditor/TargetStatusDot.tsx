import { Tooltip } from "@mantine/core";
import styles from "@editor/components/fileEditor/FileEditorThumbnail.module.css";

export interface TargetStatus {
  unsaved: boolean;
  /** e.g. "Changes not saved to OneDrive yet". */
  label: string;
}

/** A card's save state when Save sends the file to a save target. */
export function TargetStatusDot({ unsaved, label }: TargetStatus) {
  return (
    <div className={styles.thumbBadgesRight}>
      <Tooltip label={label}>
        <span
          className={styles.statusDot}
          style={{
            backgroundColor: unsaved
              ? "var(--mantine-color-yellow-6)"
              : "var(--mantine-color-green-6)",
          }}
          aria-label={label}
          data-testid="file-card-save-status"
        />
      </Tooltip>
    </div>
  );
}
