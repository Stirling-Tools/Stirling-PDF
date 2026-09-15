import { Icon } from "@app/ui/Icon";
import type { ReactNode } from "react";
import { Menu, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import type { FolderId, FolderKind } from "@app/types/folder";

export interface NewFolderButtonProps {
  label: string;
  size?: "sm" | "md";
  /** "icon" matches the workbench bar's controls; "row" the file sidebar's. */
  trigger?: "labelled" | "icon" | "row";
  /** Row trigger only: the sidebar is a rail, so the label goes. */
  collapsed?: boolean;
  /** Row trigger only, for the tests and callers that look the row up. */
  testId?: string;
  /** Set when a folder cannot be created here at all; also the tooltip. */
  disabledReason?: string | null;
  /** Set when only the server destination is unavailable; also its tooltip. */
  serverDisabledReason?: string | null;
  /** A subfolder inherits its parent's kind unless the host offers a type switch. */
  currentFolderId: FolderId | null;
  /** Keeps the type menu available inside folders; the caller validates the chosen parent. */
  allowKindSelection?: boolean;
  /** Whether this build can put a directory on screen to be mounted. */
  canAddLocalFolder: boolean;
  localFolderLabel?: string;
  onAddLocalFolder: () => void;
  /** False when the selected action transfers focus into an inline form. */
  returnFocus?: boolean;
  onOpenDialog: (parentId?: FolderId | null, kind?: FolderKind) => void;
}

/**
 * New folder, in the three shapes the destinations allow: blocked with a reason, a
 * plain button where only one destination exists, and a menu where two do. Shared by
 * the header and the empty state, so one label cannot offer two different things.
 */
export function NewFolderButton({
  label,
  size = "sm",
  trigger = "labelled",
  collapsed = false,
  testId,
  disabledReason,
  serverDisabledReason,
  currentFolderId,
  allowKindSelection = false,
  canAddLocalFolder,
  localFolderLabel,
  onAddLocalFolder,
  returnFocus = true,
  onOpenDialog,
}: NewFolderButtonProps): ReactNode {
  const { t } = useTranslation();
  const iconOnly = trigger === "icon";
  const asRow = trigger === "row";

  /** The sidebar's own action-row markup, so the row reads as one of its own.
   *  `nativeTitle` for the menu shape, which Menu.Target's clone leaves no room to
   *  wrap in a Tooltip. */
  const row = (onClick?: () => void, nativeTitle = false) => (
    <div
      className={`file-sidebar-action-row${disabledReason ? " disabled" : ""}`}
      data-testid={testId}
      role="button"
      tabIndex={disabledReason ? -1 : 0}
      aria-disabled={Boolean(disabledReason)}
      aria-label={label}
      title={nativeTitle && collapsed ? label : undefined}
      onClick={disabledReason ? undefined : onClick}
      // Not onClick: in the menu shape the click handler belongs to Menu.Target,
      // which binds the pointer only. A div has no native Enter/Space either way.
      onKeyDown={(e) => {
        if (disabledReason) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
    >
      <span className="file-sidebar-action-icon">
        <Icon name="folder-plus" />
      </span>
      {!collapsed && (
        <span className="file-sidebar-action-label sidebar-content-fade">
          {label}
        </span>
      )}
    </div>
  );

  if (disabledReason) {
    return (
      <Tooltip
        label={disabledReason}
        withinPortal
        multiline
        w={260}
        position={asRow ? "right" : undefined}
      >
        {/* Wrapped so the tooltip still opens while the button is disabled. */}
        <span style={{ display: asRow ? "block" : "inline-flex" }}>
          {asRow ? (
            row()
          ) : iconOnly ? (
            <ActionIcon
              variant="tertiary"
              size="sm"
              disabled
              aria-label={label}
              style={{ pointerEvents: "auto" }}
            >
              <Icon name="folder-plus" size={20} />
            </ActionIcon>
          ) : (
            <Button
              variant="secondary"
              size={size}
              leftSection={<Icon name="folder-plus" size={20} />}
              disabled
              style={{ pointerEvents: "auto" }}
            >
              {label}
            </Button>
          )}
        </span>
      </Tooltip>
    );
  }

  if ((!allowKindSelection && currentFolderId !== null) || !canAddLocalFolder) {
    const open = () =>
      currentFolderId !== null ? onOpenDialog() : onOpenDialog(null, "server");
    if (asRow) {
      return (
        <Tooltip
          label={label}
          position="right"
          withinPortal
          disabled={!collapsed}
        >
          {row(open)}
        </Tooltip>
      );
    }
    if (iconOnly) {
      return (
        <Tooltip label={label} withinPortal>
          <ActionIcon
            variant="tertiary"
            size="sm"
            aria-label={label}
            onClick={open}
          >
            <Icon name="folder-plus" size={20} />
          </ActionIcon>
        </Tooltip>
      );
    }
    return (
      <Button
        variant="secondary"
        size={size}
        leftSection={<Icon name="folder-plus" size={20} />}
        onClick={() =>
          currentFolderId !== null
            ? onOpenDialog()
            : onOpenDialog(null, "server")
        }
      >
        {label}
      </Button>
    );
  }

  return (
    <Menu
      shadow="md"
      position="bottom-end"
      withinPortal
      returnFocus={returnFocus}
    >
      <Menu.Target>
        {asRow ? (
          row(undefined, true)
        ) : iconOnly ? (
          <Tooltip label={label} withinPortal>
            <ActionIcon variant="tertiary" size="sm" aria-label={label}>
              <Icon name="folder-plus" size={20} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Button
            variant="secondary"
            size={size}
            leftSection={<Icon name="folder-plus" size={20} />}
            rightSection={<Icon name="chevron-down" size={20} />}
          >
            {label}
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={
            <Icon
              name="folder-up"
              size={20}
              style={{ marginRight: "0.3rem" }}
            />
          }
          onClick={onAddLocalFolder}
        >
          {localFolderLabel ??
            t("filesPage.newFolderMenu.addExisting", "Add local folder")}
        </Menu.Item>
        <Menu.Item
          className="files-page-new-folder-option"
          leftSection={<Icon name="cloud" size={20} />}
          disabled={Boolean(serverDisabledReason)}
          onClick={() => onOpenDialog(currentFolderId, "server")}
        >
          {t("filesPage.newFolderMenu.server", "New folder on the server")}
          {/* The reason is the caption: a disabled item with no explanation
              reads as broken rather than unavailable. */}
          <Text size="xs" c="dimmed">
            {serverDisabledReason ??
              t(
                "filesPage.newFolderMenu.serverHint",
                "Synced to your account, available wherever you sign in.",
              )}
          </Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
