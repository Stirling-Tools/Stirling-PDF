import type { CSSProperties } from "react";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon, type IconName } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import "@app/tools/pdfTextEditor/components/toolbar/ActionGridPanel.css";

export interface GridAction {
  icon: IconName;
  label: string;
  onClick: () => void;
  shortcut?: string;
  disabled?: boolean;
  iconStyle?: CSSProperties;
  testId?: string;
}

export interface GridSection {
  label: string;
  actions: GridAction[];
  /** Why some of the row is off, shown beside its label while it is. */
  hint?: string | null;
}

/**
 * A dropdown of related one-click actions laid out as labelled icon rows, so a
 * dozen of them take three lines instead of a long list. Stays open after an
 * action: stepping something forward twice is two clicks, not two trips.
 */
export function ActionGridPanel({
  sections,
  testId,
}: {
  sections: GridSection[];
  testId?: string;
}) {
  return (
    <div className="pdf-action-grid" data-testid={testId}>
      {sections.map((section) => (
        <div key={section.label} className="pdf-action-grid__section">
          <div className="pdf-action-grid__heading">
            <span className="pdf-action-grid__label">{section.label}</span>
            {section.hint && (
              <span className="pdf-action-grid__hint">{section.hint}</span>
            )}
          </div>
          <div className="pdf-action-grid__row">
            {section.actions.map((action) => (
              <Tooltip
                key={action.label}
                content={
                  action.shortcut
                    ? `${action.label} (${action.shortcut})`
                    : action.label
                }
                position="top"
                arrow
                portalTarget={document.body}
              >
                {/* A disabled button takes no pointer events; the span keeps
                    its tooltip, which names what the icon would do. */}
                <span className="pdf-action-grid__cell">
                  <ActionIcon
                    variant="tertiary"
                    accent="neutral"
                    size="md"
                    disabled={action.disabled}
                    onClick={action.onClick}
                    aria-label={action.label}
                    data-testid={action.testId}
                  >
                    <Icon
                      name={action.icon}
                      size="1.125rem"
                      style={action.iconStyle}
                    />
                  </ActionIcon>
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
