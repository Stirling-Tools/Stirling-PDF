import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "@mantine/core";

import LocalIcon from "@app/components/shared/LocalIcon";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { useWorkbenchBar } from "@app/contexts/WorkbenchBarContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { useAllFiles, useFileManagement } from "@app/contexts/file/fileHooks";
import { isStirlingFile } from "@app/types/fileContext";
import "@app/components/viewer/readerRail/ReaderRail.css";

/** The quick-nav rail's icon size, so the two rails read as one family. */
const SIZE = "1.125rem";

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
    {
      id: "viewer-toggle-bookmarks",
      icon: (
        <LocalIcon icon="bookmarks-outline-rounded" width={SIZE} height={SIZE} />
      ),
    },
    {
      id: "viewer-toggle-sidebar",
      icon: (
        <LocalIcon icon="view-list-outline-rounded" width={SIZE} height={SIZE} />
      ),
    },
    {
      id: "viewer-search",
      icon: <LocalIcon icon="search-rounded" width={SIZE} height={SIZE} />,
    },
  ],
  [
    {
      id: "viewer-rotate-left",
      icon: <LocalIcon icon="rotate-left-rounded" width={SIZE} height={SIZE} />,
    },
    {
      id: "viewer-rotate-right",
      icon: <LocalIcon icon="rotate-right-rounded" width={SIZE} height={SIZE} />,
    },
  ],
  [
    {
      id: "viewer-toggle-comments",
      icon: (
        <LocalIcon
          icon="chat-bubble-outline-rounded"
          width={SIZE}
          height={SIZE}
        />
      ),
    },
    {
      id: "viewer-read-aloud",
      icon: (
        <LocalIcon icon="volume-up-outline-rounded" width={SIZE} height={SIZE} />
      ),
    },
  ],
];

export function ReaderRail() {
  const { t } = useTranslation();
  const { buttons, actions } = useWorkbenchBar();
  const { activeFileId, setActiveFileId } = useViewer();
  const { removeFiles } = useFileManagement();
  const { requestNavigation } = useNavigationGuard();
  const { files, fileIds } = useAllFiles();

  // The id as the workbench holds it, so the close acts on a document that is
  // really open rather than one the viewer has not caught up with.
  const openFileId = useMemo(
    () => fileIds.find((id) => (id as string) === activeFileId) ?? null,
    [fileIds, activeFileId],
  );

  // Through the guard, because closing what you are reading is a way out of it and
  // unsaved changes still deserve their prompt. Storage keeps its copy: this closes
  // the document, it does not delete it. The viewer falls to the next one open.
  const closeDocument = useCallback(() => {
    if (!openFileId) return;
    requestNavigation(() => {
      void removeFiles([openFileId], false);
    });
  }, [openFileId, removeFiles, requestNavigation]);

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

  const closeLabel = t("reader.rail.close", "Close document");

  // One document is just the one you are reading, so the picker only earns its
  // place once there is a choice to make.
  const documents = useMemo(
    () =>
      files
        .filter((file) => isStirlingFile(file))
        .map((file) => ({ id: file.fileId as string, name: file.name })),
    [files],
  );
  const hasChoice = documents.length > 1;
  const currentName =
    documents.find((doc) => doc.id === activeFileId)?.name ??
    documents[0]?.name ??
    "";

  const registered = useMemo(
    () => new Map(buttons.map((button) => [button.id, button])),
    [buttons],
  );

  return (
    <nav
      className="reader-rail"
      aria-label={t("reader.rail.label", "Reading tools")}
    >
      {/* Which document, and whether it stays open: both are about the document
          itself rather than how it is read, so they lead the rail. */}
      <div className="reader-rail__group">
        <AppTooltip content={closeLabel} position="left" arrow delay={0}>
          <ActionIcon
            variant="tertiary"
            size="md"
            shape="circle"
            aria-label={closeLabel}
            disabled={!openFileId}
            onClick={closeDocument}
          >
            <LocalIcon icon="close-rounded" width={SIZE} height={SIZE} />
          </ActionIcon>
        </AppTooltip>
        {hasChoice && (
          <Menu shadow="md" width={260} position="left-start">
            <Menu.Target>
              <ActionIcon
                variant="tertiary"
                size="md"
                shape="circle"
                // The name is in the dropdown; the trigger says what it opens.
                aria-label={t("reader.rail.switchDocument", "Switch document")}
              >
                <LocalIcon
                  icon="description-outline-rounded"
                  width={SIZE}
                  height={SIZE}
                />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{currentName}</Menu.Label>
              {documents.map((doc) => (
                <Menu.Item
                  key={doc.id}
                  onClick={() => setActiveFileId(doc.id)}
                  leftSection={
                    doc.id === activeFileId ? (
                      <LocalIcon
                        icon="check-rounded"
                        width={SIZE}
                        height={SIZE}
                      />
                    ) : (
                      // Holds the column so the names line up either way.
                      <span className="reader-rail__tick-space" />
                    )
                  }
                >
                  <span className="reader-rail__doc-name">{doc.name}</span>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
        <div className="reader-rail__divider" />
      </div>
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
    </nav>
  );
}

export default ReaderRail;
