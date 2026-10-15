import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { AnimatedHeight } from "@app/components/shared/setupCard/AnimatedHeight";
import { SetupCardLayout } from "@app/components/shared/setupCard/SetupCardLayout";
import styles from "@app/components/shared/setupCard/SetupCard.module.css";

interface SetupStepFrameProps {
  /** Shown top right, as "current of total". */
  progress?: { current: number; total: number };
  /** Shows a Back button top left. */
  onBack?: () => void;
  title: ReactNode;
  subtitle: ReactNode;
  children?: ReactNode;
  /** Omit both to show no actions, as while the server restarts. */
  primaryLabel?: ReactNode;
  onPrimary?: () => void;
  primaryLoading?: boolean;
  secondaryLabel?: ReactNode;
  onSecondary?: () => void;
}

/**
 * One wizard card. Keep it mounted across steps: only the header and body
 * sit inside AnimatedHeight, so when a step changes size the actions ride the
 * card's bottom edge instead of jumping to their new place first. Past the
 * card's max height the header and body scroll and the actions stay put.
 */
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
  return (
    <div className={styles.frame}>
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
        <div className={styles.actions}>
          <Button
            variant="primary"
            fat
            fullWidth
            loading={primaryLoading}
            onClick={onPrimary}
          >
            {primaryLabel}
          </Button>
          {secondaryLabel && onSecondary && (
            <Button variant="quiet" size="sm" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
