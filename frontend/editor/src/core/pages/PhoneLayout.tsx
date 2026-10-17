import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { LogoIcon } from "@app/components/shared/LogoIcon";
import { Wordmark } from "@app/components/shared/Wordmark";
import RightSidebar from "@app/components/tools/RightSidebar";
import Workbench from "@app/components/layout/Workbench";
import type { MobileView } from "@app/pages/initialMobileView";

/**
 * The home page's narrow-screen layout. HomePage owns the view state and its
 * transitions (adding files, full-screen tools, restored sessions all move it);
 * this decides how "tools" and "workbench" are shown.
 */
export interface PhoneLayoutProps {
  view: MobileView;
  onSelectView: (view: MobileView) => void;
  /** Horizontally scrolled container HomePage animates between the two views. */
  sliderRef: RefObject<HTMLDivElement | null>;
  showSwipeHint: boolean;
  /** The file library is open and takes the whole screen. */
  filesMode: boolean;
  brandAltText: string;
  onShowTools: () => void;
  /** Null when automation is unavailable. */
  onShowAutomate: (() => void) | null;
  onShowFiles: () => void;
  onOpenSettings: () => void;
}

/** Tools and workspace side by side in a swipeable slider, with a bottom bar. */
export function PhoneLayout({
  view,
  onSelectView,
  sliderRef,
  showSwipeHint,
  filesMode,
  brandAltText,
  onShowTools,
  onShowAutomate,
  onShowFiles,
  onOpenSettings,
}: PhoneLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="mobile-layout" data-files-mode={filesMode}>
      {/* The library brings its own tabs and folder path, so the
        tools/workspace toggle would only cost it vertical space. Every
        other view keeps the toggle. */}
      {!filesMode && (
        <div className="mobile-toggle">
          <div className="mobile-brand">
            <LogoIcon className="mobile-brand-icon" />
            <Wordmark alt={brandAltText} className="mobile-brand-text" />
          </div>
          <div
            className="mobile-toggle-buttons"
            role="tablist"
            aria-label={t("home.mobile.viewSwitcher", "Switch workspace view")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "tools"}
              className={`mobile-toggle-button ${view === "tools" ? "active" : ""}`}
              onClick={() => onSelectView("tools")}
            >
              {t("home.mobile.tools", "Tools")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "workbench"}
              className={`mobile-toggle-button ${view === "workbench" ? "active" : ""}`}
              onClick={() => onSelectView("workbench")}
            >
              {t("home.mobile.workspace", "Workspace")}
            </button>
          </div>
        </div>
      )}
      {filesMode ? (
        /* /files takes the whole viewport. Skipping the slider keeps
          the FileManagerView from being trapped inside a 100vw
          horizontal-scroll container (which truncated buttons and
          created a stray side-scroll surface on touch). */
        <div className="mobile-files-full">
          <div className="flex-1 min-h-0 flex" style={{ minWidth: 0 }}>
            <Workbench />
          </div>
        </div>
      ) : (
        <div className="mobile-slider-wrap">
          <div ref={sliderRef} className="mobile-slider">
            <div
              className="mobile-slide"
              aria-label={t("home.mobile.toolsSlide", "Tool selection panel")}
            >
              <div className="mobile-slide-content">
                <RightSidebar />
              </div>
            </div>
            <div
              className="mobile-slide"
              aria-label={t("home.mobile.workbenchSlide", "Workspace panel")}
            >
              <div className="mobile-slide-content">
                <div className="flex-1 min-h-0 flex" style={{ minWidth: 0 }}>
                  <Workbench />
                </div>
              </div>
            </div>
          </div>
          {showSwipeHint && (
            <span className="mobile-swipe-hint" aria-hidden="true">
              {t(
                "home.mobile.swipeHint",
                "Swipe left or right to switch views",
              )}
            </span>
          )}
        </div>
      )}
      <div className="mobile-bottom-bar">
        <Button
          variant="tertiary"
          className="mobile-bottom-button"
          aria-label={t("quickAccess.allTools", "Tools")}
          onClick={onShowTools}
        >
          <Icon name="layout-grid" size={"1.5rem"} />
          <span className="mobile-bottom-button-label">
            {t("quickAccess.allTools", "Tools")}
          </span>
        </Button>
        {onShowAutomate && (
          <Button
            variant="tertiary"
            className="mobile-bottom-button"
            aria-label={t("quickAccess.automate", "Automate")}
            onClick={onShowAutomate}
          >
            <Icon name="waypoints" size="1.5rem" />
            <span className="mobile-bottom-button-label">
              {t("quickAccess.automate", "Automate")}
            </span>
          </Button>
        )}
        <Button
          variant="tertiary"
          className="mobile-bottom-button"
          aria-label={t("home.mobile.openFiles", "Open files")}
          onClick={onShowFiles}
        >
          <Icon name="folder" size="1.5rem" />
          <span className="mobile-bottom-button-label">
            {t("quickAccess.files", "Files")}
          </span>
        </Button>
        <Button
          variant="tertiary"
          className="mobile-bottom-button"
          aria-label={t("quickAccess.config", "Config")}
          onClick={onOpenSettings}
        >
          <Icon name="settings" size="1.5rem" />
          <span className="mobile-bottom-button-label">
            {t("quickAccess.config", "Config")}
          </span>
        </Button>
      </div>
    </div>
  );
}
