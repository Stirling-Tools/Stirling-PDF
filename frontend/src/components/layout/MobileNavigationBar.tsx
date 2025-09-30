import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, Tooltip } from "@mantine/core";
import LocalIcon from "../shared/LocalIcon";
import { useToolWorkflow } from "../../contexts/ToolWorkflowContext";
import { useFilesModalContext } from "../../contexts/FilesModalContext";
import useIsMobile from "../../hooks/useIsMobile";
import styles from "./MobileNavigationBar.module.css";

interface MobileNavigationBarProps {
  activePane: "tools" | "workbench";
  onPaneChange: (pane: "tools" | "workbench") => void;
}

export default function MobileNavigationBar({
  activePane,
  onPaneChange,
}: MobileNavigationBarProps) {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const {
    handleBackToTools,
    handleReaderToggle,
    handleToolSelect,
    resetTool,
    selectedToolKey,
    readerMode,
    isPanelVisible,
  } = useToolWorkflow();
  const { openFilesModal, isFilesModalOpen } = useFilesModalContext();

  const items = useMemo(
    () => [
      {
        id: "tools" as const,
        label: t("mobileNav.tools", "Tools"),
        icon: "handyman-rounded",
        isActive: activePane === "tools" && isPanelVisible,
        onClick: () => {
          if (!isPanelVisible) {
            return;
          }
          handleBackToTools();
          onPaneChange("tools");
        },
        disabled: !isPanelVisible,
      },
      {
        id: "workbench" as const,
        label: t("mobileNav.document", "Document"),
        icon: "description-rounded",
        isActive: activePane === "workbench",
        onClick: () => {
          onPaneChange("workbench");
        },
      },
      {
        id: "read" as const,
        label: t("quickAccess.read", "Read"),
        icon: "menu-book-rounded",
        isActive: readerMode,
        onClick: () => {
          handleBackToTools();
          handleReaderToggle();
          onPaneChange("workbench");
        },
      },
      {
        id: "automate" as const,
        label: t("quickAccess.automate", "Automate"),
        icon: "automation-outline",
        isActive: selectedToolKey === "automate",
        onClick: () => {
          if (selectedToolKey === "automate") {
            resetTool("automate");
          } else {
            handleToolSelect("automate");
          }
          onPaneChange("tools");
        },
      },
      {
        id: "files" as const,
        label: t("quickAccess.files", "Files"),
        icon: "folder-rounded",
        isActive: isFilesModalOpen,
        onClick: () => {
          openFilesModal();
        },
      },
    ],
    [
      activePane,
      handleBackToTools,
      handleReaderToggle,
      handleToolSelect,
      isFilesModalOpen,
      isPanelVisible,
      onPaneChange,
      openFilesModal,
      readerMode,
      resetTool,
      selectedToolKey,
      t,
    ]
  );

  if (!isMobile) {
    return null;
  }

  return (
    <nav className={styles.container} aria-label={t("mobileNav.navigation", "Primary navigation")!}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`${styles.button} ${item.isActive ? styles.active : ""} ${
            item.disabled ? styles.disabled : ""
          }`}
          onClick={item.onClick}
          disabled={item.disabled}
        >
          <Tooltip label={item.label} position="top" withinPortal>
            <ActionIcon
              variant="subtle"
              size="lg"
              radius="xl"
              aria-pressed={item.isActive}
            >
              <LocalIcon icon={item.icon} width="1.6rem" height="1.6rem" />
            </ActionIcon>
          </Tooltip>
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
