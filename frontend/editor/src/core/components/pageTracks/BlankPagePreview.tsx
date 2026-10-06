import { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { BlankTrackPage } from "@app/components/pageTracks/types";
import styles from "@app/components/pageTracks/PageTracks.module.css";

interface BlankPagePreviewProps {
  page: BlankTrackPage;
  /** Which box the page is fitted to: a lane tile, or the page-view modal. */
  placement: "tile" | "view";
}

/** A blank page drawn at its own proportions and turned like a rendered one. */
export function BlankPagePreview({ page, placement }: BlankPagePreviewProps) {
  const { t } = useTranslation();
  const quarterTurn = page.rotation === 90 || page.rotation === 270;
  return (
    <div
      className={[
        styles.blankPage,
        placement === "tile" ? styles.blankInTile : styles.blankInView,
        quarterTurn ? styles.blankQuarterTurn : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--blank-ar": page.width / page.height,
          transform: `rotate(${page.rotation}deg)`,
        } as CSSProperties
      }
      data-blank-page
      data-original-rotation={page.rotation}
    >
      {t("pageTracks.blankPage", "Blank page")}
    </div>
  );
}
