import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon, type IconName } from "@app/ui/Icon";
import RightSidebar from "@app/components/tools/RightSidebar";
import Workbench from "@app/components/layout/Workbench";
import { ToolSheet } from "@app/pages/ToolSheet";
import type { PhoneLayoutProps } from "@core/pages/PhoneLayout";
import "@app/pages/PhoneLayout.css";

export type { PhoneLayoutProps };

interface TabProps {
  icon: IconName;
  label: string;
  active: boolean;
  onClick: () => void;
}

function Tab({ icon, label, active, onClick }: TabProps) {
  return (
    <Button
      variant="tertiary"
      className="mobile-bottom-button"
      data-active={active}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} size="1.5rem" />
      <span className="mobile-bottom-button-label">{label}</span>
    </Button>
  );
}

/**
 * The document stays on screen and tools open over it in a bottom sheet, so
 * there is no second "workspace" view to find. The "tools" view is the sheet
 * being open; HomePage's own transitions close it when a file arrives or a
 * full-screen tool takes over.
 */
export function PhoneLayout({
  view,
  onSelectView,
  filesMode,
  onShowTools,
  onShowAutomate,
  onShowFiles,
  onOpenSettings,
}: PhoneLayoutProps) {
  const { t } = useTranslation();
  const sheetOpen = view === "tools" && !filesMode;

  return (
    <div className="mobile-layout phone-layout" data-files-mode={filesMode}>
      <div className="phone-layout-stage">
        <div className="phone-layout-workbench">
          <Workbench />
        </div>
        {!filesMode && (
          <ToolSheet open={sheetOpen} onClose={() => onSelectView("workbench")}>
            <RightSidebar />
          </ToolSheet>
        )}
      </div>
      <nav className="mobile-bottom-bar">
        <Tab
          icon="layout-grid"
          label={t("quickAccess.allTools", "Tools")}
          active={sheetOpen}
          onClick={sheetOpen ? () => onSelectView("workbench") : onShowTools}
        />
        {onShowAutomate && (
          <Tab
            icon="waypoints"
            label={t("quickAccess.automate", "Automate")}
            active={false}
            onClick={onShowAutomate}
          />
        )}
        <Tab
          icon="folder"
          label={t("quickAccess.files", "Files")}
          active={filesMode}
          onClick={onShowFiles}
        />
        <Tab
          icon="settings"
          label={t("quickAccess.config", "Config")}
          active={false}
          onClick={onOpenSettings}
        />
      </nav>
    </div>
  );
}
