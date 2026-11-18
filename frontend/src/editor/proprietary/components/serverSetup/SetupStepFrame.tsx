import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { AnimatedHeight } from "@editor/components/shared/setupCard/AnimatedHeight";
import { SetupCardLayout } from "@editor/components/shared/setupCard/SetupCardLayout";
import styles from "@editor/components/shared/setupCard/SetupCard.module.css";

interface SetupStepFrameProps {
  /** Shown top right, as "current of total". */
  progress?: { current: number; total: number };
  /** Shows a Back button top left. */
  onBack?: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  /** Omit both to show no actions, as while the server restarts. */
  primaryLabel?: ReactNode;
  onPrimary?: () => void;
  primaryLoading?: boolean;
  /** With `onSecondary`, a two-way choice: this button left, the primary
   *  right, neither focused when it appears. */
  secondaryLabel?: ReactNode;
  onSecondary?: () => void;
}

/** One wizard card; keep it mounted across steps so the actions ride its edge
 *  as it resizes. Past its max height the header and body scroll. */
export function SetupStepFrame({
  progress,
  onBack,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryLoading,
  secondaryLabel,
  onSecondary,
}: SetupStepFrameProps) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLDivElement>(null);
  const isChoice = Boolean(secondaryLabel && onSecondary);

  // The card stays mounted, so focus left on the previous step's button would
  // land on one of the answers, and Enter would choose it unread.
  useEffect(() => {
    if (isChoice) frameRef.current?.focus();
  }, [isChoice]);

  return (
    <div ref={frameRef} className={styles.frame} tabIndex={-1}>
      <AnimatedHeight className={styles.frameScroll}>
        {(onBack || progress) && (
          <div className={styles.topBar}>
            {onBack ? (
              <Button
                variant="quiet"
                size="sm"
                leftSection={<Icon name="arrow-left" size={14} />}
                onClick={onBack}
              >
                {t("serverSetup.back", "Back")}
              </Button>
            ) : (
              <span />
            )}
            {progress && (
              <span className={styles.progress}>
                {t("serverSetup.stepCount", "{{current}} of {{total}}", {
                  current: progress.current,
                  total: progress.total,
                })}
              </span>
            )}
          </div>
        )}
        <SetupCardLayout title={title} subtitle={subtitle}>
          {children}
        </SetupCardLayout>
      </AnimatedHeight>
      {primaryLabel && onPrimary && (
        <div
          className={styles.actions}
          data-choice={isChoice ? "true" : undefined}
        >
          {isChoice && (
            <Button
              key="secondary"
              variant="secondary"
              fat
              fullWidth
              onClick={onSecondary}
            >
              {secondaryLabel}
            </Button>
          )}
          <Button
            key="primary"
            variant="primary"
            fat
            fullWidth
            loading={primaryLoading}
            onClick={onPrimary}
          >
            {primaryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
