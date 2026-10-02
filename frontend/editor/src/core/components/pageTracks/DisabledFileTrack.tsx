import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { truncateCenter } from "@app/utils/textUtils";
import { FileId } from "@app/types/file";
import {
  trackHandleId,
  trackZoneId,
} from "@app/components/pageTracks/TrackRow";
import styles from "@app/components/pageTracks/PageTracks.module.css";

interface DisabledFileTrackProps {
  fileId: FileId;
  name: string;
  /** Draw the track-reorder line above this row. */
  dropBefore: boolean;
  /** Draw it below (last row, dropping at the end). */
  dropAfterLast: boolean;
  onClose: () => void;
}

/**
 * An open file the page editor can't edit (not a PDF). Shown greyed as a
 * header-only row, like a collapsed track with nothing to expand. It still
 * joins the track order and can be dragged to reorder (and so reorders the
 * open files), so every file type sits in one sequence.
 */
export function DisabledFileTrack({
  fileId,
  name,
  dropBefore,
  dropAfterLast,
  onClose,
}: DisabledFileTrackProps) {
  const { t } = useTranslation();
  const closeLabel = t("pageTracks.track.close", "Close file");
  const { listeners, setNodeRef: setHandleRef } = useDraggable({
    id: trackHandleId(fileId),
    data: { type: "trackHandle", fileId },
  });
  const { setNodeRef: setZoneRef } = useDroppable({
    id: trackZoneId(fileId),
    data: { type: "zone", fileId },
  });
  return (
    <section
      ref={setZoneRef}
      className={[
        styles.track,
        styles.trackDisabled,
        dropBefore ? styles.trackDropBefore : "",
        dropAfterLast ? styles.trackDropAfterLast : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-track-file-id={fileId}
      data-unsupported
      data-track-drop-before={dropBefore || undefined}
    >
      <header ref={setHandleRef} className={styles.trackHeader} {...listeners}>
        <span className={styles.trackName}>
          <PrivateContent>{truncateCenter(name, 40)}</PrivateContent>
        </span>
        <div className={styles.trackActions}>
          <Tooltip position="bottom" content={closeLabel}>
            <ActionIcon
              variant="quiet"
              size="sm"
              accent="danger"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <Icon name="x" size="1rem" />
            </ActionIcon>
          </Tooltip>
        </div>
      </header>
    </section>
  );
}

export default DisabledFileTrack;
