import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import { Tooltip } from "@editor/components/shared/Tooltip";
import classes from "@editor/components/tools/automate/Automate.module.css";

interface AutomatePanelHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Longer text kept behind an info icon beside the title. */
  info?: string;
  /** Renders a back arrow; the caller decides whether leaving needs a confirm. */
  onBack?: () => void;
  backLabel?: string;
  actions?: ReactNode;
  /** For a short, known title: never truncate it; let the actions wrap instead. */
  fixedTitle?: boolean;
}

/** The one header every Automate mode shares, so moving between modes reads as one surface. */
export default function AutomatePanelHeader({
  title,
  subtitle,
  info,
  onBack,
  backLabel,
  actions,
  fixedTitle = false,
}: AutomatePanelHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className={classes.header} data-fixed-title={fixedTitle || undefined}>
      {onBack && (
        <ActionIcon
          variant="tertiary"
          accent="neutral"
          size="sm"
          onClick={onBack}
          aria-label={backLabel ?? t("automate.back", "Back to automations")}
          title={backLabel ?? t("automate.back", "Back to automations")}
        >
          <Icon name="arrow-left" size={16} />
        </ActionIcon>
      )}
      <div className={classes.headerText}>
        <div className={classes.headerTitleRow}>
          <h2
            className={classes.headerTitle}
            style={{ margin: 0 }}
            tabIndex={-1}
            data-automate-heading
          >
            {title}
          </h2>
          {info && (
            <Tooltip
              content={info}
              position="left"
              sidebarTooltip={false}
              maxWidth={260}
              arrow
            >
              <button
                type="button"
                className={classes.headerInfo}
                aria-label={t("automate.about", "About this automation")}
              >
                <Icon name="info" size={14} />
              </button>
            </Tooltip>
          )}
        </div>
        {subtitle && <span className={classes.headerSubtitle}>{subtitle}</span>}
      </div>
      {actions && <div className={classes.headerActions}>{actions}</div>}
    </div>
  );
}
