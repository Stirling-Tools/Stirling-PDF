import { useEffect, useState } from "react";
import { Modal, Loader, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { useFileSelectors } from "@app/contexts/FileContext";
import { thumbnailGenerationService } from "@app/services/thumbnailGenerationService";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { TrackPage, sourcePageKey } from "@app/components/pageTracks/types";
import { TrackThumbnailStore } from "@app/components/pageTracks/hooks/useTrackThumbnails";
import styles from "@app/components/pageTracks/PageTracks.module.css";

interface TrackPageViewModalProps {
  /** The track's pages, so the modal can page through them. */
  pages: TrackPage[];
  /** Index into `pages` of the page currently shown. */
  index: number;
  onIndexChange: (index: number) => void;
  /** The tile thumbnail store, for an instant low-res placeholder per page. */
  thumbnails: TrackThumbnailStore;
  onClose: () => void;
}

// Rendered above the tile scale so the page reads as a full-screen preview
// rather than a blown-up thumbnail.
const PREVIEW_SCALE = 2;

/**
 * A large preview of one page, with previous/next paging through its track.
 * Renders the source page at high resolution on open (and on each move),
 * showing the low-res tile thumbnail meanwhile. Rotation is applied in CSS on
 * an unrotated render, matching how the tiles draw the page.
 */
export function TrackPageViewModal({
  pages,
  index,
  onIndexChange,
  thumbnails,
  onClose,
}: TrackPageViewModalProps) {
  const { t } = useTranslation();
  const selectors = useFileSelectors();
  const [hiRes, setHiRes] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const page = pages[index];
  const total = pages.length;
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    setHiRes(null);
    setFailed(false);
    const file = selectors.getFile(page.sourceFileId);
    if (!file) {
      setFailed(true);
      return;
    }
    void (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const [result] = await thumbnailGenerationService.generateThumbnails(
          page.sourceFileId,
          buffer,
          [page.sourcePageNumber],
          { scale: PREVIEW_SCALE, quality: 0.92 },
        );
        if (cancelled) return;
        if (result?.success && result.thumbnail) setHiRes(result.thumbnail);
        else setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectors, page]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        onIndexChange(index - 1);
      } else if (event.key === "ArrowRight" && index < total - 1) {
        event.preventDefault();
        onIndexChange(index + 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, total, onIndexChange]);

  if (!page) return null;

  const src = hiRes ?? thumbnails.get(sourcePageKey(page));
  const quarterTurn = page.rotation === 90 || page.rotation === 270;
  const prevLabel = t("pageTracks.prevPage", "Previous page");
  const nextLabel = t("pageTracks.nextPage", "Next page");

  return (
    <Modal
      opened
      onClose={onClose}
      centered
      size="auto"
      title={t("pageTracks.pagePosition", "Page {{number}} of {{total}}", {
        number: index + 1,
        total,
      })}
    >
      <div className={styles.pageViewBody}>
        <Tooltip content={prevLabel}>
          <ActionIcon
            className={styles.pageViewNav}
            variant="quiet"
            aria-label={prevLabel}
            disabled={!hasPrev}
            onClick={() => onIndexChange(index - 1)}
          >
            <ChevronLeftIcon sx={{ fontSize: "1.75rem" }} />
          </ActionIcon>
        </Tooltip>

        <div className={styles.pageViewStage}>
          {src ? (
            <PrivateContent>
              <img
                className={[
                  styles.pageViewImage,
                  quarterTurn ? styles.pageViewQuarter : "",
                  "ph-no-capture",
                ]
                  .filter(Boolean)
                  .join(" ")}
                src={src}
                alt=""
                style={{ transform: `rotate(${page.rotation}deg)` }}
              />
            </PrivateContent>
          ) : failed ? (
            <Text c="dimmed" size="sm">
              {t("pageTracks.viewError", "Couldn't render this page")}
            </Text>
          ) : (
            <Loader />
          )}
        </div>

        <Tooltip content={nextLabel}>
          <ActionIcon
            className={styles.pageViewNav}
            variant="quiet"
            aria-label={nextLabel}
            disabled={!hasNext}
            onClick={() => onIndexChange(index + 1)}
          >
            <ChevronRightIcon sx={{ fontSize: "1.75rem" }} />
          </ActionIcon>
        </Tooltip>
      </div>
    </Modal>
  );
}

export default TrackPageViewModal;
