import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import ViewListIcon from "@mui/icons-material/ViewList";
import SearchIcon from "@mui/icons-material/Search";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import ChatBubbleOutlinedIcon from "@mui/icons-material/ChatBubbleOutlined";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { useWorkbenchBar } from "@app/contexts/WorkbenchBarContext";
import { ReaderSignButton } from "@app/components/viewer/readerRail/ReaderSignButton";
import "@app/components/viewer/readerRail/ReaderRail.css";

interface RailItem {
  /** The viewer's id for this control, where the viewer has one. */
  id: string;
  icon: React.ReactNode;
}

/**
 * The controls that belong beside a document being read, grouped by what they are
 * for, with a rule between groups.
 *
 * The icons are declared here rather than taken from the viewer, so the rail is the
 * same shape with a document open or not: the viewer only mounts once something is
 * open, and a rail that filled in as files arrived would be a moving target. Where
 * the viewer has registered a control, its own behaviour is used - that is how find
 * and read-aloud keep the popovers they already had - and where it has not, the icon
 * is there but disabled.
 *
 * Absent on purpose: page navigation, zoom and the colour filters, which live in the
 * viewer's own toolbar that reading collapses rather than removes; and anything that
 * changes the document rather than the reading of it, which is the editor's business.
 */
const RAIL_GROUPS: readonly (readonly RailItem[])[] = [
  [
    { id: "viewer-toggle-bookmarks", icon: <MenuBookIcon fontSize="small" /> },
    { id: "viewer-toggle-sidebar", icon: <ViewListIcon fontSize="small" /> },
    { id: "viewer-search", icon: <SearchIcon fontSize="small" /> },
  ],
  [
    { id: "viewer-rotate-left", icon: <RotateLeftIcon fontSize="small" /> },
    { id: "viewer-rotate-right", icon: <RotateRightIcon fontSize="small" /> },
  ],
  [
    {
      id: "viewer-toggle-comments",
      icon: <ChatBubbleOutlinedIcon fontSize="small" />,
    },
    { id: "viewer-read-aloud", icon: <VolumeUpIcon fontSize="small" /> },
  ],
];

export function ReaderRail() {
  const { t } = useTranslation();
  const { buttons, actions } = useWorkbenchBar();

  const labels: Record<string, string> = useMemo(
    () => ({
      "viewer-toggle-bookmarks": t("reader.rail.bookmarks", "Bookmarks"),
      "viewer-toggle-sidebar": t("reader.rail.thumbnails", "Pages"),
      "viewer-search": t("reader.rail.search", "Find in document"),
      "viewer-rotate-left": t("reader.rail.rotateLeft", "Rotate left"),
      "viewer-rotate-right": t("reader.rail.rotateRight", "Rotate right"),
      "viewer-toggle-comments": t("reader.rail.comment", "Comments"),
      "viewer-read-aloud": t("reader.rail.readAloud", "Read aloud"),
    }),
    [t],
  );

  const registered = useMemo(
    () => new Map(buttons.map((button) => [button.id, button])),
    [buttons],
  );

  return (
    <nav
      className="reader-rail"
      aria-label={t("reader.rail.label", "Reading tools")}
    >
      {RAIL_GROUPS.map((group, index) => (
        <div className="reader-rail__group" key={group[0].id}>
          {index > 0 && <div className="reader-rail__divider" />}
          {group.map((item) => {
            const label = labels[item.id] ?? item.id;
            const button = registered.get(item.id);
            const action = button ? actions[button.id] : undefined;

            // A control that brought its own renderer keeps it: that is where the
            // search field and the read-aloud controls live.
            if (button?.render) {
              return (
                <div className="reader-rail__item" key={item.id}>
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

            return (
              <AppTooltip
                key={item.id}
                content={label}
                position="left"
                arrow
                // No delay: the rail is icons only, so the tooltip is the label.
                delay={0}
              >
                <ActionIcon
                  variant={button?.active ? "primary" : "tertiary"}
                  size="md"
                  shape="circle"
                  aria-label={label}
                  aria-pressed={button?.active}
                  // Nothing open means nothing to act on, but the rail keeps its shape.
                  disabled={!action || Boolean(button?.disabled)}
                  onClick={() => action?.()}
                >
                  {item.icon}
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
