import type { ReactNode } from "react";
import { Box, ScrollArea, Text, TextInput } from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import { ActionIcon } from "@app/ui/ActionIcon";
import "@app/components/viewer/SidebarBase.css";

export const SIDEBAR_WIDTH = "15rem";

export interface SidebarBaseProps {
  /** Sidebar title string or React element. */
  title: ReactNode;
  /** Header icon (ReactNode or string icon name for LocalIcon). */
  icon: ReactNode;
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
  children,
}: SidebarBaseProps) {
  if (!visible) {
    return null;
  }

  const renderIcon =
    typeof icon === "string" ? (
      <LocalIcon icon={icon} width="1.1rem" height="1.1rem" />
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
              <LocalIcon icon="close-rounded" width="1.1rem" height="1.1rem" />
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
            leftSection={
              <LocalIcon icon="search" width="1.1rem" height="1.1rem" />
            }
            size="xs"
          />
        </Box>
      )}

      <ScrollArea style={{ flex: 1 }}>
        <Box p="sm" className="sidebar-base__content">
          {children}
        </Box>
      </ScrollArea>
    </Box>
  );
}
