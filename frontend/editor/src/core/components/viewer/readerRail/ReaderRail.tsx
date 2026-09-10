import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { useWorkbenchBar } from "@app/contexts/WorkbenchBarContext";
import { ReaderSignButton } from "@app/components/viewer/readerRail/ReaderSignButton";
import "@app/components/viewer/readerRail/ReaderRail.css";

/**
 * Which of the viewer's controls belong beside a document being read, in the order
 * they appear down the rail. Grouped by what they are for, with a rule between
 * groups.
 *
 * The viewer registers all of these whether or not the bar that usually shows them
 * is on screen, so the rail renders the registrations rather than its own copies -
 * search and read-aloud bring their own popovers with them that way.
 *
 * Absent on purpose: page navigation, zoom and the colour filters, which live in the
 * viewer's own toolbar that reading collapses rather than removes; and anything that
 * changes the document rather than the reading of it, which is the editor's business.
 */
const RAIL_GROUPS: readonly (readonly string[])[] = [
  ["viewer-toggle-bookmarks", "viewer-toggle-sidebar", "viewer-search"],
  ["viewer-rotate-left", "viewer-rotate-right"],
  ["viewer-toggle-comments", "viewer-read-aloud"],
];

export function ReaderRail() {
  const { t } = useTranslation();
  const { buttons, actions } = useWorkbenchBar();

  const groups = useMemo(() => {
    const byId = new Map(buttons.map((button) => [button.id, button]));
    return RAIL_GROUPS.map((ids) =>
      ids.map((id) => byId.get(id)).filter((button) => button !== undefined),
    ).filter((group) => group.length > 0);
  }, [buttons]);

  return (
    <nav
      className="reader-rail"
      aria-label={t("reader.rail.label", "Reading tools")}
    >
      {groups.map((group, index) => (
        <div className="reader-rail__group" key={group[0].id}>
          {index > 0 && <div className="reader-rail__divider" />}
          {group.map((button) => {
            const action = actions[button.id];
            // A button that brought its own renderer keeps it: that is where the
            // search field and the read-aloud controls live.
            if (button.render) {
              return (
                <div className="reader-rail__item" key={button.id}>
                  {button.render({
                    id: button.id,
                    disabled: Boolean(button.disabled),
                    allButtonsDisabled: false,
                    action,
                    triggerAction: () => action?.(),
                    active: Boolean(button.active),
                  })}
                </div>
              );
            }
            const label =
              button.ariaLabel ??
              (typeof button.tooltip === "string" ? button.tooltip : button.id);
            return (
              <AppTooltip
                key={button.id}
                content={button.tooltip ?? label}
                position="left"
                arrow
                // No delay: the rail is icons only, so the tooltip is the label.
                delay={0}
              >
                <ActionIcon
                  variant={button.active ? "primary" : "tertiary"}
                  size="md"
                  shape="circle"
                  aria-label={label}
                  aria-pressed={button.active}
                  disabled={button.disabled}
                  onClick={() => action?.()}
                >
                  {button.icon}
                </ActionIcon>
              </AppTooltip>
            );
          })}
        </div>
      ))}
      <div className="reader-rail__divider" />
      <ReaderSignButton />
    </nav>
  );
}

export default ReaderRail;
