import { useCallback, useEffect, useRef, useState } from "react";
import type { TouchEvent } from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "../contexts/ToolWorkflowContext";
import { Group } from "@mantine/core";
import { useSidebarContext } from "../contexts/SidebarContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { getBaseUrl } from "../constants/app";

import ToolPanel from "../components/tools/ToolPanel";
import Workbench from "../components/layout/Workbench";
import QuickAccessBar from "../components/shared/QuickAccessBar";
import RightRail from "../components/shared/RightRail";
import FileManager from "../components/FileManager";
import MobileNavigationBar from "../components/layout/MobileNavigationBar";
import useIsMobile from "../hooks/useIsMobile";
import styles from "./HomePage.module.css";


export default function HomePage() {
  const { t } = useTranslation();
  const {
    sidebarRefs,
  } = useSidebarContext();

  const { quickAccessRef } = sidebarRefs;

  const {
    selectedTool,
    selectedToolKey,
    isPanelVisible,
  } = useToolWorkflow();

  const isMobile = useIsMobile();
  const [activePane, setActivePane] = useState<"tools" | "workbench">("tools");
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  const handlePaneChange = useCallback(
    (pane: "tools" | "workbench") => {
      if (pane === "tools" && !isPanelVisible) {
        return;
      }
      setActivePane(pane);
    },
    [isPanelVisible]
  );

  useEffect(() => {
    if (!isMobile) {
      setActivePane("tools");
      setTouchStartX(null);
      setDragDelta(0);
      setIsDragging(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (isMobile && !isPanelVisible) {
      setActivePane("workbench");
    }
  }, [isMobile, isPanelVisible]);

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (event.touches.length !== 1) {
        return;
      }
      if (activePane === "workbench" && !isPanelVisible) {
        return;
      }
      setTouchStartX(event.touches[0].clientX);
      setDragDelta(0);
      setIsDragging(true);
    },
    [activePane, isPanelVisible]
  );

  const handleTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (!isDragging || touchStartX === null) {
      return;
    }
    const current = event.touches[0]?.clientX ?? 0;
    setDragDelta(current - touchStartX);
  }, [isDragging, touchStartX]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging || !sliderContainerRef.current) {
      setIsDragging(false);
      setTouchStartX(null);
      setDragDelta(0);
      return;
    }

    const width = sliderContainerRef.current.offsetWidth || 1;
    const threshold = width * 0.18;

    if (activePane === "tools" && dragDelta < -threshold) {
      setActivePane("workbench");
    } else if (activePane === "workbench" && dragDelta > threshold && isPanelVisible) {
      setActivePane("tools");
    }

    setIsDragging(false);
    setTouchStartX(null);
    setDragDelta(0);
  }, [activePane, dragDelta, isDragging, isPanelVisible]);

  let sliderTransform = activePane === "tools" ? "translateX(0%)" : "translateX(-50%)";
  if (sliderContainerRef.current) {
    const width = sliderContainerRef.current.offsetWidth || 1;
    const percentOffset = isDragging ? (dragDelta / width) * 50 : 0;

    if (activePane === "tools") {
      const clamped = Math.max(Math.min(percentOffset, 0), -50);
      sliderTransform = `translateX(${clamped}%)`;
    } else if (isPanelVisible) {
      const clamped = Math.max(Math.min(percentOffset, 50), 0);
      sliderTransform = `translateX(${-50 + clamped}%)`;
    }
  }

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

  if (isMobile) {
    return (
      <div className={styles.mobileWrapper}>
        <div className={styles.mobileTabs}>
          <button
            type="button"
            className={`${styles.mobileTabButton} ${
              activePane === "tools" && isPanelVisible ? styles.mobileTabButtonActive : ""
            }`}
            onClick={() => handlePaneChange("tools")}
            disabled={!isPanelVisible}
          >
            {t("mobileNav.tools", "Tools")}
          </button>
          <button
            type="button"
            className={`${styles.mobileTabButton} ${
              activePane === "workbench" ? styles.mobileTabButtonActive : ""
            }`}
            onClick={() => handlePaneChange("workbench")}
          >
            {t("mobileNav.document", "Document")}
          </button>
        </div>
        <div
          ref={sliderContainerRef}
          className={styles.mobileSliderContainer}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div className={styles.mobileIndicator} aria-hidden="true">
            <span
              className={`${styles.mobileIndicatorDot} ${
                activePane === "tools" && isPanelVisible ? styles.mobileIndicatorDotActive : ""
              }`}
            />
            <span
              className={`${styles.mobileIndicatorDot} ${
                activePane === "workbench" ? styles.mobileIndicatorDotActive : ""
              }`}
            />
          </div>
          <div
            className={`${styles.mobileSlider} ${isDragging ? styles.mobileSliderDragging : ""}`}
            style={{ transform: sliderTransform }}
          >
            <div className={styles.mobilePane}>
              {isPanelVisible && <div className={styles.mobileEdgeGlow} aria-hidden="true" />}
              <div className={styles.mobilePaneInner}>
                <ToolPanel />
              </div>
            </div>
            <div className={styles.mobilePane}>
              <div className={styles.mobilePaneInner}>
                <Workbench />
              </div>
            </div>
          </div>
        </div>
        <MobileNavigationBar activePane={activePane} onPaneChange={handlePaneChange} />
        <FileManager selectedTool={selectedTool as any /* FIX ME */} />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden">
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
    </div>
  );
}
