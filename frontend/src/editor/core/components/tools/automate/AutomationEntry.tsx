import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@editor/ui/Icon";
import { Tooltip } from "@editor/components/shared/Tooltip";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { toolDisplayName } from "@editor/components/tools/automate/stepSummary";
import AutomationActionsMenu, {
  type AutomationAction,
} from "@editor/components/tools/automate/AutomationActionsMenu";
import classes from "@editor/components/tools/automate/Automate.module.css";

interface AutomationEntryProps {
  title: string;
  badgeIcon?: IconName;
  onClick: () => void;
  actions?: AutomationAction[];
  /** Shown with the steps in the hover tooltip. */
  description?: string;
  /** Operation ids, drawn as the step chain in the hover tooltip. */
  operations?: string[];
  toolRegistry?: Partial<ToolRegistry>;
}

/**
 * A library row: icon and name, with the description and step chain in a
 * tooltip to the left on hover. The trailing chevron becomes the actions menu
 * on hover or focus.
 */
export default function AutomationEntry({
  title,
  badgeIcon = "settings",
  onClick,
  actions = [],
  description,
  operations = [],
  toolRegistry = {},
}: AutomationEntryProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const rowButton = (
    <button type="button" className={classes.rowButton} onClick={onClick}>
      <span className={classes.iconTile} aria-hidden>
        <Icon name={badgeIcon} size={16} />
      </span>
      <span className={classes.rowText}>
        <span className={classes.rowTitle}>{title}</span>
      </span>
    </button>
  );

  const hasTooltip = Boolean(description) || operations.length > 0;

  return (
    <div className={classes.row} data-menu-open={menuOpen || undefined}>
      {hasTooltip && !menuOpen ? (
        <Tooltip
          content={
            <div className={classes.rowTooltip}>
              {description && (
                <p className={classes.rowTooltipText}>{description}</p>
              )}
              {operations.length > 0 && (
                <div className={classes.rowTooltipChain}>
                  {operations.map((op, index) => (
                    <span
                      key={`${op}-${index}`}
                      className={classes.rowTooltipStep}
                      data-testid="automation-chain-step"
                    >
                      {index > 0 && (
                        <Icon
                          name="arrow-right"
                          size={14}
                          className={classes.rowTooltipArrow}
                        />
                      )}
                      <span className={classes.rowTooltipChip}>
                        {toolDisplayName(t, toolRegistry, op)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          }
          position="left"
          sidebarTooltip={false}
          arrow
          delay={500}
          maxWidth={440}
        >
          {rowButton}
        </Tooltip>
      ) : (
        rowButton
      )}
      <span className={classes.rowTrailing}>
        <Icon
          name="chevron-right"
          size={16}
          className={actions.length > 0 ? classes.rowChevron : undefined}
          style={
            actions.length > 0 ? undefined : { color: "var(--c-text-subtle)" }
          }
        />
        <AutomationActionsMenu
          actions={actions}
          className={classes.rowMenu}
          onOpenChange={setMenuOpen}
          label={t("automate.entryMenu.label", "Open menu for {{title}}", {
            title,
          })}
        />
      </span>
    </div>
  );
}
