/** Bodies and hero art for the classification demo's slides; the card chrome around them
 *  belongs to {@link OnboardingSlideShell}. */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { ShellHero } from "@app/components/onboarding/OnboardingSlideShell";
import { BrandMark } from "@app/components/shared/BrandMark";
import {
  CLASSIFICATION_DEMO_BATCH_SIZE,
  groupColour,
  type ClassificationDemoGroupCount,
  type ClassificationDemoPhase,
  type ClassificationDemoProgress,
} from "@app/components/onboarding/classificationDemo/classificationDemoSweep";
import styles from "@app/components/onboarding/classificationDemo/classificationDemo.module.css";

export function DefaultAppHero() {
  return <ShellHero appIcon />;
}

export function FolderHero() {
  return (
    <ShellHero>
      <FolderOpenRoundedIcon sx={{ fontSize: 30 }} />
    </ShellHero>
  );
}

/** The app mark over shimmering status text, so the pause between files reads as
 *  progress rather than a hang. */
export function ProcessingHero({ label }: { label: string }) {
  return (
    <div className={styles.processingHero}>
      <span className={styles.markGlow} aria-hidden="true">
        <BrandMark height="3.25rem" className="sui-brandmark--working" />
      </span>
      <span className={styles.shimmer} aria-live="polite">
        {label}
      </span>
    </div>
  );
}

/** The status line the hero shimmers, one phrase per phase of the sweep. */
export function useProcessingLabel(
  phase: ClassificationDemoPhase,
  processed: number,
  total: number,
): string {
  const { t } = useTranslation();
  switch (phase) {
    case "reading":
      return t(
        "classificationDemo.phase.reading",
        "Reading Downloads folder...",
      );
    case "gathering":
      return t("classificationDemo.phase.gathering", "Gathering PDF files...");
    case "finished":
      return t("classificationDemo.phase.finishing", "Finishing up...");
    case "processing":
    default:
      return t(
        "classificationDemo.phase.processing",
        "Processing file {{done}}/{{total}}...",
        {
          done: Math.min(processed + 1, total),
          total,
        },
      );
  }
}

/** How long each pre-count status line stays before the next. */
const STATUS_ROTATE_MS = 1200;

/** What the sweep is doing before it has a count to show. Each line names work the
 *  phase really does: mounting is one record written so the folder appears in the
 *  library; gathering is one stat per file, which is where the live figure comes from. */
function useSweepStatus(progress: ClassificationDemoProgress): string {
  const { t } = useTranslation();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setTick((n) => n + 1),
      STATUS_ROTATE_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  const lines: string[] =
    progress.phase === "reading"
      ? [
          t(
            "classificationDemo.status.connecting",
            "Connecting your Downloads folder...",
          ),
          t(
            "classificationDemo.status.library",
            "Adding it to your file library...",
          ),
        ]
      : [
          t(
            "classificationDemo.status.listing",
            "Listing the files in Downloads...",
          ),
          progress.listing && progress.listing.checked > 0
            ? t(
                "classificationDemo.status.checked",
                "Checked {{checked}} of {{total}} files...",
                progress.listing,
              )
            : t(
                "classificationDemo.status.checking",
                "Checking each file's name and date...",
              ),
          t(
            "classificationDemo.status.picking",
            "Looking for the {{count}} most recent PDFs...",
            { count: CLASSIFICATION_DEMO_BATCH_SIZE },
          ),
        ];
  return lines[tick % lines.length];
}

/** The line under the hero: the running count once the batch is known, and until then
 *  what the sweep is doing instead of a count of nothing. */
export function ProcessingCounts({
  progress,
}: {
  progress: ClassificationDemoProgress;
}) {
  const { t } = useTranslation();
  const status = useSweepStatus(progress);
  if (progress.total === 0 && progress.phase !== "finished") {
    return (
      <p className={styles.counts} aria-live="polite">
        {status}
      </p>
    );
  }
  return (
    <p className={styles.counts}>
      <span className={styles.countsNumber}>{progress.processed}</span>
      {t(
        "classificationDemo.processing.counts",
        "of {{total}} PDFs processed",
        {
          total: progress.total,
        },
      )}
    </p>
  );
}

/** Running tally of what the sweep has found. Colours mirror the Files sidebar's rule,
 *  so a category reads the same here as it will there afterwards. */
export function CategoryTicker({
  groups,
  selectedId,
  onSelect,
}: {
  groups: ClassificationDemoGroupCount[];
  /** Omit both to render a plain, non-interactive tally (the live ticker). */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div className={styles.ticker}>
      {groups.map((group) => {
        const colour = groupColour(group.id);
        const dot = (
          <>
            <span className={styles.chipDot} style={{ background: colour }} />
            {group.name}
            <span className={styles.chipCount}>{group.count}</span>
          </>
        );
        if (!onSelect) {
          return (
            <span key={group.id} className={styles.chip}>
              {dot}
            </span>
          );
        }
        const isSelected = group.id === selectedId;
        return (
          <button
            key={group.id}
            type="button"
            className={`${styles.chip} ${styles.chipButton} ${
              isSelected ? styles.chipSelected : ""
            }`}
            aria-pressed={isSelected}
            onClick={() => onSelect(isSelected ? null : group.id)}
          >
            {dot}
          </button>
        );
      })}
    </div>
  );
}

export function PrivacyNote() {
  const { t } = useTranslation();
  return (
    <div className={styles.note}>
      <LockOutlinedIcon fontSize="small" className={styles.noteIcon} />
      {t(
        "classificationDemo.offer.privacy",
        "Everything stays on this device and you can stop anytime.",
      )}
    </div>
  );
}

/** The follow-up offer. A batch smaller than what is left means the allowance is the
 *  limit, so the copy names the number it can actually cover. */
export function FollowUpPanel({
  remaining,
  batchSize,
}: {
  remaining: number;
  batchSize: number;
}) {
  const { t } = useTranslation();
  const partial = batchSize < remaining;
  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>
        {t(
          "classificationDemo.followUp.title",
          "Want to keep going? You have {{count}} more PDFs in your Downloads folder.",
          { count: remaining },
        )}
      </div>
      <div className={styles.panelBody}>
        {partial
          ? t(
              "classificationDemo.followUp.partial",
              "{{count}} of them are covered by your remaining free allowance.",
              { count: batchSize },
            )
          : t(
              "classificationDemo.followUp.free",
              "They are all covered by your remaining free allowance.",
            )}{" "}
        {t(
          "classificationDemo.followUp.background",
          "This runs in the background. The ring on the left shows progress.",
        )}
      </div>
    </div>
  );
}
