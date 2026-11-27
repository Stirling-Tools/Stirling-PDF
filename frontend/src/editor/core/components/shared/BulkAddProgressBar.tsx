import { useTranslation } from "react-i18next";
import type { BulkAddProgress } from "@editor/services/bulkAddProgress";
import styles from "@editor/components/shared/BulkAddProgressBar.module.css";

interface BulkAddProgressBarProps {
  progress: BulkAddProgress;
  className?: string;
  /**
   * Reads each update out to screen readers. Give it to one bar only: two on
   * screen at once would announce every file twice.
   */
  announce?: boolean;
}

export function BulkAddProgressBar({
  progress: { done, total },
  className,
  announce = false,
}: BulkAddProgressBarProps) {
  const { t } = useTranslation();
  return (
    <div
      className={className ? `${styles.bar} ${className}` : styles.bar}
      {...(announce ? { role: "status", "aria-live": "polite" as const } : {})}
    >
      <div className={styles.label}>
        <span>{t("fileSidebar.addingFiles", "Adding files…")}</span>
        <span className={styles.count}>
          {done}/{total}
        </span>
      </div>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
    </div>
  );
}
