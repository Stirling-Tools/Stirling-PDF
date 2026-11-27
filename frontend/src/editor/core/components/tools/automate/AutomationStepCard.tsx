import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader, VisuallyHidden } from "@mantine/core";
import { Icon } from "@editor/ui/Icon";
import type { ExecutionStep } from "@editor/types/automation";
import classes from "@editor/components/tools/automate/Automate.module.css";

interface AutomationStepCardProps {
  /** Zero-based; shown one-based in the step badge. */
  index: number;
  title: ReactNode;
  meta?: ReactNode;
  status?: ExecutionStep["status"];
  actions?: ReactNode;
  expanded?: boolean;
  /** Draws the card and its number in the warning colour until it is opened. */
  needsSettings?: boolean;
  /** Marks the card so a caller can find it again after a reorder. */
  stepId?: string;
  /**
   * Makes the head clickable. Clicks on a control inside the head, or in a
   * portal it opens (a menu), go to that control instead.
   */
  onHeadClick?: () => void;
  /** Rendered under the head: the tool picker, the settings, or a step error. */
  children?: ReactNode;
}

function StepBadge({
  index,
  status,
}: {
  index: number;
  status: ExecutionStep["status"];
}) {
  return (
    <span className={classes.stepIndex} data-status={status} aria-hidden>
      {status === "completed" ? (
        <Icon name="check" size={12} />
      ) : status === "error" ? (
        <Icon name="x" size={12} />
      ) : status === "running" ? (
        <Loader size={10} color="currentColor" />
      ) : (
        index + 1
      )}
    </span>
  );
}

function isOwnHeadClick(event: MouseEvent<HTMLDivElement>): boolean {
  const target = event.target as Element;
  return (
    event.currentTarget.contains(target) &&
    !target.closest("button, a, input, select, textarea, label")
  );
}

/** One step, drawn the same in the builder and the workspace. */
export default function AutomationStepCard({
  index,
  title,
  meta,
  status = "pending",
  actions,
  expanded = false,
  needsSettings = false,
  onHeadClick,
  stepId,
  children,
}: AutomationStepCardProps) {
  const { t } = useTranslation();
  // The badge is decorative, so its status is spoken from here instead.
  const statusText =
    status === "running"
      ? t("automate.steps.status.running", "Running")
      : status === "completed"
        ? t("automate.steps.status.completed", "Done")
        : status === "error"
          ? t("automate.steps.status.error", "Failed")
          : null;
  return (
    <div
      className={classes.stepCard}
      data-expanded={expanded || undefined}
      data-needs-settings={needsSettings || undefined}
      data-status={status}
      data-clickable={onHeadClick ? true : undefined}
      data-step-id={stepId}
      data-testid="automation-step-card"
    >
      <div
        className={classes.stepHead}
        onClick={
          onHeadClick &&
          ((event) => {
            if (isOwnHeadClick(event)) onHeadClick();
          })
        }
      >
        <StepBadge index={index} status={status} />
        <div className={classes.stepText}>
          <span className={classes.stepTitle}>
            <VisuallyHidden>
              {t("automate.steps.position", "Step {{n}}:", {
                n: index + 1,
              })}{" "}
            </VisuallyHidden>
            {title}
            {statusText && <VisuallyHidden>, {statusText}</VisuallyHidden>}
          </span>
          {meta && <span className={classes.stepMeta}>{meta}</span>}
        </div>
        {actions && <div className={classes.stepActions}>{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function StepConnector() {
  return <div className={classes.stepConnector} aria-hidden />;
}
