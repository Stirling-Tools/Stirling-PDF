import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "../contexts/ToolWorkflowContext";
import { ActionIcon, Group, useMantineColorScheme } from "@mantine/core";
import { useSidebarContext } from "../contexts/SidebarContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { BASE_PATH, getBaseUrl } from "../constants/app";
import { useMediaQuery } from "@mantine/hooks";

import ToolPanel from "../components/tools/ToolPanel";
import Workbench from "../components/layout/Workbench";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import RightRail from "../components/shared/RightRail";
import FileManager from "../components/FileManager";
import LocalIcon from "../components/shared/LocalIcon";
import { useFilesModalContext } from "../contexts/FilesModalContext";

import "./HomePage.css";

type MobileView = "tools" | "workbench";


export default function HomePage() {
  const { t } = useTranslation();
  const {
    sidebarRefs,
  } = useSidebarContext();

  const { quickAccessRef } = sidebarRefs;

  const { selectedTool, selectedToolKey } = useToolWorkflow();

  const { openFilesModal } = useFilesModalContext();
  const { colorScheme } = useMantineColorScheme();
  const isMobile = useMediaQuery("(max-width: 900px)");
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Record<MobileView, HTMLDivElement | null>>({
    tools: null,
    workbench: null,
  });
  const [activeMobileView, setActiveMobileView] = useState<MobileView>("tools");

  const brandName = t("home.mobile.brandName", "Stirling");
  const brandAltText = t("home.mobile.brandAlt", "Stirling PDF logo");
  const brandMarkSrc = `${BASE_PATH}/branding/StirlingPDFLogoNoText${
    colorScheme === "dark" ? "Dark" : "Light"
  }.svg`;

  const scrollToMobileView = useCallback(
    (view: MobileView, behavior: ScrollBehavior = "smooth") => {
      const container = sliderRef.current;
      const target = slideRefs.current[view];

      if (!container || !target) {
        return;
      }

      if (behavior === "auto") {
        container.scrollLeft = target.offsetLeft;
        return;
      }

      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({
          behavior,
          block: "nearest",
          inline: "start",
        });
        return;
      }

      if (typeof container.scrollTo === "function") {
        container.scrollTo({ left: target.offsetLeft, behavior });
        return;
      }

      container.scrollLeft = target.offsetLeft;
    },
    []
  );

  const handleSelectMobileView = useCallback(
    (view: MobileView) => {
      scrollToMobileView(view);
      setActiveMobileView(view);
    },
    [scrollToMobileView]
  );

  useEffect(() => {
    if (isMobile) {
      scrollToMobileView(activeMobileView, "auto");
      return;
    }

    if (activeMobileView !== "tools") {
      setActiveMobileView("tools");
    }
    scrollToMobileView("tools", "auto");
  }, [activeMobileView, isMobile, scrollToMobileView]);

  useEffect(() => {
    if (!isMobile) return;

    const container = sliderRef.current;
    if (!container) return;

    let animationFrame = 0;

    const handleScroll = () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        const { scrollLeft, offsetWidth } = container;
        const threshold = offsetWidth / 2;
        const nextView: MobileView = scrollLeft >= threshold ? "workbench" : "tools";
        setActiveMobileView((current) => (current === nextView ? current : nextView));
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isMobile]);

  const baseUrl = getBaseUrl();

  // Update document meta when tool changes
  useDocumentMeta({
    title: selectedTool ? `${selectedTool.name} - Stirling PDF` : 'Stirling PDF',
    description: selectedTool?.description || t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogTitle: selectedTool ? `${selectedTool.name} - Stirling PDF` : 'Stirling PDF',
    ogDescription: selectedTool?.description || t('app.description', 'The Free Adobe Acrobat alternative (10M+ Downloads)'),
    ogImage: selectedToolKey ? `${baseUrl}/og_images/${selectedToolKey}.png` : `${baseUrl}/og_images/home.png`,
    ogUrl: selectedTool ? `${baseUrl}${window.location.pathname}` : baseUrl
  });

  // Note: File selection limits are now handled directly by individual tools

  return (
    <div className="h-screen overflow-hidden">
      {isMobile ? (
        <div className="mobile-layout">
          <div className="mobile-toggle">
            <div className="mobile-header">
              <div className="mobile-brand">
                <img src={brandMarkSrc} alt={brandAltText} className="mobile-brand-mark" />
                <span className="mobile-brand-name">{brandName}</span>
              </div>
              <ActionIcon
                variant="subtle"
                size="md"
                aria-label={t('home.mobile.openFiles', 'Open files')}
                onClick={() => openFilesModal()}
              >
                <LocalIcon icon="folder-rounded" width="1.25rem" height="1.25rem" />
              </ActionIcon>
            </div>
            <div className="mobile-toggle-buttons" role="tablist" aria-label={t('home.mobile.viewSwitcher', 'Switch workspace view')}>
              <button
                type="button"
                role="tab"
                aria-selected={activeMobileView === "tools"}
                className={`mobile-toggle-button ${activeMobileView === "tools" ? "active" : ""}`}
                onClick={() => handleSelectMobileView("tools")}
              >
                {t('home.mobile.tools', 'Tools')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeMobileView === "workbench"}
                className={`mobile-toggle-button ${activeMobileView === "workbench" ? "active" : ""}`}
                onClick={() => handleSelectMobileView("workbench")}
              >
                {t('home.mobile.workspace', 'Workspace')}
              </button>
            </div>
            <span className="mobile-toggle-hint">
              {t('home.mobile.swipeHint', 'Swipe left or right to switch views')}
            </span>
          </div>
          <div ref={sliderRef} className="mobile-slider">
            <div
              className="mobile-slide"
              aria-label={t('home.mobile.toolsSlide', 'Tool selection panel')}
              ref={(node) => {
                slideRefs.current.tools = node;
              }}
            >
              <div className="mobile-slide-content">
                <ToolPanel />
              </div>
            </div>
            <div
              className="mobile-slide"
              aria-label={t('home.mobile.workbenchSlide', 'Workspace panel')}
              ref={(node) => {
                slideRefs.current.workbench = node;
              }}
            >
              <div className="mobile-slide-content">
                <div className="flex-1 min-h-0 flex flex-col">
                  <Workbench />
                </div>
              </div>
            </div>
          </div>
          <FileManager selectedTool={selectedTool as any /* FIX ME */} />
        </div>
      ) : (
        <Group
          align="flex-start"
          gap={0}
          h="100%"
          className="flex-nowrap flex"
        >
          <QuickAccessBar
            ref={quickAccessRef} />
          <ToolPanel />
          <Workbench />
          <RightRail />
          <FileManager selectedTool={selectedTool as any /* FIX ME */} />
        </Group>
      )}
    </div>
  );
}
