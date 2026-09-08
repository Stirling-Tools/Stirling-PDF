import type { ReactNode } from "react";
import { Box, ScrollArea, Text, TextInput } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import "@app/components/viewer/SidebarBase.css";

import { Icon, isIconName, type IconName } from "@app/ui/Icon";
export const SIDEBAR_WIDTH = "15rem";

export interface SidebarBaseProps {
  /** Sidebar title string or React element. */
  title: ReactNode;
  /** Header icon: a registry icon name, or your own node. */
  icon: IconName | ReactNode;
  /** Right offset position string (e.g. "15rem" or "0rem"). */
  rightOffset?: string;
  /** Sidebar visibility flag. */
  visible?: boolean;
  /** Additional CSS class names. */
  className?: string;
  /** Callback fired when user clicks the header close button. */
  onClose?: () => void;
  /** Accessible label for the close button. */
  closeLabel?: string;
  /** Extra buttons/elements to render in the header right actions area. */
  headerActions?: ReactNode;
  /** Current search input term. */
  searchTerm?: string;
  /** Search input placeholder text. */
  searchPlaceholder?: string;
  /** Callback fired when search query changes. */
  onSearchChange?: (value: string) => void;
  /** Optional ref for the ScrollArea viewport element. */
  viewportRef?: React.Ref<HTMLDivElement>;
  /** Sidebar content children. */
  children: ReactNode;
}

export function SidebarBase({
  title,
  icon,
  rightOffset = "0rem",
  visible = true,
  className = "",
  onClose,
  closeLabel = "Close sidebar",
  headerActions,
  searchTerm,
  searchPlaceholder,
  onSearchChange,
  viewportRef,
  children,
}: SidebarBaseProps) {
  if (!visible) {
    return null;
  }

  const renderIcon = isIconName(icon) ? (
    <Icon name={icon} size="1.1rem" />
  ) : (
    icon
  );

  return (
    <Box
      className={["sidebar-base", className].filter(Boolean).join(" ")}
      style={{
        position: "fixed",
        right: rightOffset,
        top: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        zIndex: 998,
      }}
    >
      <div className="sidebar-base__header">
        <div className="sidebar-base__header-title">
          <span className="sidebar-base__header-icon">{renderIcon}</span>
          <Text fw={600} size="sm" tt="uppercase" lts={0.5}>
            {title}
          </Text>
        </div>
        <Box style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {headerActions}
          {onClose && (
            <ActionIcon
              variant="tertiary"
              accent="neutral"
              size="sm"
              onClick={onClose}
              aria-label={closeLabel}
              title={closeLabel}
            >
              <Icon name="x" size="1.1rem" />
            </ActionIcon>
          )}
        </Box>
      </div>

      {onSearchChange !== undefined && (
        <Box px="sm" pb="sm" className="sidebar-base__search">
          <TextInput
            value={searchTerm ?? ""}
            placeholder={searchPlaceholder ?? "Search..."}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            leftSection={<Icon name="search" size="1.1rem" />}
            size="xs"
          />
        </Box>
      )}

      <ScrollArea style={{ flex: 1 }} viewportRef={viewportRef}>
        <Box p="sm" className="sidebar-base__content">
          {children}
        </Box>
      </ScrollArea>
    </Box>
  );
}
