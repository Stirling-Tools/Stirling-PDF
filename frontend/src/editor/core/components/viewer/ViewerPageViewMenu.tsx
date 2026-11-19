import { useEffect, useState } from "react";
import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import { SpreadMode } from "@embedpdf/plugin-spread/react";
import { Icon } from "@editor/ui/Icon";
import { useViewer } from "@editor/contexts/ViewerContext";
import {
  BarMenu,
  toggleMark,
} from "@editor/components/viewer/ViewerBarControls";
import type { PdfRenderMode } from "@editor/services/preferencesService";

/** How the pages are shown: one or two at a time, fitted how, in what colours. */
export function ViewerPageViewMenu({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const {
    getScrollState,
    getZoomState,
    getSpreadState,
    zoomActions,
    spreadActions,
    zoomRestorePendingRef,
    zoomRestoreSettledTick,
    registerImmediateZoomUpdate,
    registerImmediateSpreadUpdate,
    pdfRenderMode,
    setPdfRenderMode,
  } = useViewer();

  const [spreadMode, setSpreadMode] = useState(
    () => getSpreadState().spreadMode,
  );
  useEffect(() => {
    setSpreadMode(getSpreadState().spreadMode);
    return registerImmediateSpreadUpdate((mode) => setSpreadMode(mode));
  }, [registerImmediateSpreadUpdate, getSpreadState]);
  const isDualPage = spreadMode !== SpreadMode.None;
  const isCoverPage = spreadMode === SpreadMode.Even;

  // A carried zoom's fit pass is intermediate, so the fit mode holds until its
  // settled tick re-syncs from the live state.
  const [zoomLevel, setZoomLevel] = useState(() => getZoomState().level);
  useEffect(() => {
    if (!zoomRestorePendingRef.current) setZoomLevel(getZoomState().level);
    return registerImmediateZoomUpdate(() => {
      if (zoomRestorePendingRef.current) return;
      setZoomLevel(getZoomState().level);
    });
  }, [
    registerImmediateZoomUpdate,
    getZoomState,
    zoomRestorePendingRef,
    zoomRestoreSettledTick,
  ]);

  const singlePageOnly = getScrollState().totalPages <= 1;
  const colours: [PdfRenderMode, string][] = [
    ["normal", t("workbenchBar.pageColourNormal", "Normal")],
    ["dark", t("workbenchBar.pageColourDark", "Dark")],
    ["sepia", t("workbenchBar.pageColourSepia", "Sepia")],
  ];

  return (
    <BarMenu
      icon="book-open"
      label={t("workbenchBar.pageView", "Page view")}
      disabled={disabled}
      testId="viewer-page-view-menu"
    >
      <Menu.Label>{t("workbenchBar.pageLayout", "Layout")}</Menu.Label>
      <Menu.Item
        leftSection={<Icon name="file-text" size="1rem" />}
        rightSection={toggleMark(!isDualPage)}
        data-checked={!isDualPage || undefined}
        disabled={singlePageOnly}
        onClick={() => isDualPage && spreadActions.toggleSpreadMode()}
      >
        {t("viewer.singlePageView", "Single Page View")}
      </Menu.Item>
      <Menu.Item
        leftSection={<Icon name="columns-2" size="1rem" />}
        rightSection={toggleMark(isDualPage)}
        data-checked={isDualPage || undefined}
        disabled={singlePageOnly}
        onClick={() => !isDualPage && spreadActions.toggleSpreadMode()}
      >
        {t("viewer.dualPageView", "Dual Page View")}
      </Menu.Item>
      {/* From one page at a time, this goes straight to pairs with the cover alone. */}
      <Menu.Item
        leftSection={<Icon name="book" size="1rem" />}
        rightSection={toggleMark(isCoverPage)}
        data-checked={isCoverPage || undefined}
        disabled={singlePageOnly}
        onClick={() =>
          spreadActions.setSpreadMode(
            isCoverPage ? SpreadMode.Odd : SpreadMode.Even,
          )
        }
      >
        {t("viewer.coverPageView", "Show Cover Page Separately")}
      </Menu.Item>
      <Menu.Divider />
      <Menu.Label>{t("workbenchBar.pageFit", "Fit")}</Menu.Label>
      <Menu.Item
        leftSection={<Icon name="arrow-left-right" size="1rem" />}
        rightSection={toggleMark(zoomLevel === ZoomMode.FitWidth)}
        data-checked={zoomLevel === ZoomMode.FitWidth || undefined}
        onClick={() => zoomActions.requestZoom(ZoomMode.FitWidth)}
      >
        {t("viewer.fitWidth", "Fit to width")}
      </Menu.Item>
      <Menu.Item
        leftSection={<Icon name="scan" size="1rem" />}
        rightSection={toggleMark(zoomLevel === ZoomMode.FitPage)}
        data-checked={zoomLevel === ZoomMode.FitPage || undefined}
        onClick={() => zoomActions.requestZoom(ZoomMode.FitPage)}
      >
        {t("viewer.fitPage", "Fit to page")}
      </Menu.Item>
      <Menu.Divider />
      <Menu.Label>{t("workbenchBar.pageColours", "Page colours")}</Menu.Label>
      {colours.map(([mode, label]) => (
        <Menu.Item
          key={mode}
          leftSection={
            <span
              className={`viewer-page-colour-swatch viewer-page-colour-swatch--${mode}`}
            />
          }
          rightSection={toggleMark(pdfRenderMode === mode)}
          data-checked={pdfRenderMode === mode || undefined}
          onClick={() => setPdfRenderMode(mode)}
        >
          {label}
        </Menu.Item>
      ))}
    </BarMenu>
  );
}
