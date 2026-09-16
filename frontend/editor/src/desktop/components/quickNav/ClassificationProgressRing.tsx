/** Rail indicator for a folder being classified in the background: a ring that fills in
 *  proportion to the folder done, the percentage inside, and a tick that takes it away. */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { Tooltip } from "@app/components/shared/Tooltip";
import "@app/components/shared/quickNav/QuickNavRail.css";
import styles from "@app/components/quickNav/ClassificationProgressRing.module.css";

const SIZE = 32;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** How long the tick is shown before {@link ClassificationProgressRingProps.onSettled}. */
const SETTLE_MS = 1800;

export interface ClassificationProgressRingProps {
  /** Documents classified so far. */
  processed: number;
  /** PDFs in the folder; the ring is full when every one is done. */
  total: number;
  status: "running" | "done";
  /** Folder name for the tooltip and accessible name, e.g. "Downloads". */
  folderName: string;
  onClick?: () => void;
  /** Fired once the tick has been on screen long enough to read; the owner removes the item. */
  onSettled?: () => void;
}

export function ClassificationProgressRing({
  processed,
  total,
  status,
  folderName,
  onClick,
  onSettled,
}: ClassificationProgressRingProps) {
  const { t } = useTranslation();
  const [leaving, setLeaving] = useState(false);
  const done = status === "done";
  const fraction = done ? 1 : Math.min(processed / Math.max(total, 1), 1);
  const percent = Math.round(fraction * 100);

  useEffect(() => {
    if (!done) {
      setLeaving(false);
      return;
    }
    const leave = window.setTimeout(() => setLeaving(true), SETTLE_MS);
    const settle = window.setTimeout(() => onSettled?.(), SETTLE_MS + 300);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(settle);
    };
  }, [done, onSettled]);

  const title = done
    ? t("classificationDemo.ring.done", "{{folder}} classified", {
        folder: folderName,
      })
    : t("classificationDemo.ring.running", "Classifying {{folder}}", {
        folder: folderName,
      });
  const detail = done
    ? t("classificationDemo.ring.doneDetail", "{{count}} PDFs sorted by type", {
        count: processed,
      })
    : t(
        "classificationDemo.ring.progress",
        "{{done}} of {{total}} PDFs ({{percent}}%)",
        { done: processed, total, percent },
      );

  return (
    <Tooltip
      position="right"
      arrow
      content={
        <span className={styles.tip}>
          <strong>{title}</strong>
          <span>{detail}</span>
        </span>
      }
    >
      <button
        type="button"
        className={`quick-nav-rail-item ${styles.item} ${leaving ? styles.leaving : ""}`}
        aria-label={`${title}: ${detail}`}
        data-state={done ? "done" : "running"}
        onClick={onClick}
      >
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className={styles.ring}
          aria-hidden="true"
        >
          <circle
            className={styles.track}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
          />
          <circle
            className={styles.fill}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          />
        </svg>
        <span className={styles.centre} aria-hidden="true">
          {done ? (
            <CheckRoundedIcon className={styles.tick} />
          ) : (
            <span className={styles.percent}>{percent}%</span>
          )}
        </span>
      </button>
    </Tooltip>
  );
}
