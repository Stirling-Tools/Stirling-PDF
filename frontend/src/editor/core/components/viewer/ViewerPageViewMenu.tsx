import { useEffect, useId, useState } from "react";
import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import { SpreadMode } from "@embedpdf/plugin-spread/react";
import { Icon, type IconName } from "@editor/ui/Icon";
import { useViewer } from "@editor/contexts/ViewerContext";
import {
  BarMenu,
  toggleProps,
  SelectedNote,
} from "@editor/components/viewer/ViewerBarControls";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import type {
  PdfRenderMode,
  ViewerZoomSetting,
} from "@editor/services/preferencesService";

/** How the pages are shown: one or two at a time, fitted how, in what colours. */
export function ViewerPageViewMenu({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const {
    getScrollState,
    getSpreadState,
    zoomActions,
    spreadActions,
    registerImmediateSpreadUpdate,
    registerImmediateScrollUpdate,
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

  // The fit documents open at, and the page bar's reset returns to; choosing
  // one also applies it now.
  const { preferences, updatePreference } = usePreferences();
  const chooseDefaultZoom = (setting: ViewerZoomSetting, level: ZoomMode) => {
    updatePreference("defaultViewerZoom", setting);
    zoomActions.requestZoom(level);
  };
  const fits: [ViewerZoomSetting, ZoomMode, IconName, string][] = [
    [
      "fitWidth",
      ZoomMode.FitWidth,
      "arrow-left-right",
      t("viewer.fitWidth", "Fit to width"),
    ],
    ["fitPage", ZoomMode.FitPage, "scan", t("viewer.fitPage", "Fit to page")],
  ];

  const [totalPages, setTotalPages] = useState(
    () => getScrollState().totalPages,
  );
  useEffect(() => {
    setTotalPages(getScrollState().totalPages);
    return registerImmediateScrollUpdate((_page, total) =>
      setTotalPages(total),
    );
  }, [registerImmediateScrollUpdate, getScrollState]);
  const singlePageOnly = totalPages <= 1;
  const colours: [PdfRenderMode, string][] = [
    ["normal", t("workbenchBar.pageColourNormal", "Normal")],
    ["dark", t("workbenchBar.pageColourDark", "Dark")],
    ["sepia", t("workbenchBar.pageColourSepia", "Sepia")],
  ];

  const selectedNoteId = useId();

  return (
    <BarMenu
      icon="columns-2"
      label={t("workbenchBar.pageView", "View")}
      disabled={disabled}
      testId="viewer-page-view-menu"
    >
      <SelectedNote id={selectedNoteId} />
      <Menu.Label>{t("workbenchBar.pageLayout", "Layout")}</Menu.Label>
      <Menu.Item
        leftSection={<Icon name="file-text" size="1rem" />}
        {...toggleProps(!isDualPage, selectedNoteId)}
        disabled={singlePageOnly}
        onClick={() => isDualPage && spreadActions.toggleSpreadMode()}
      >
        {t("viewer.singlePageView", "Single Page View")}
      </Menu.Item>
      <Menu.Item
        leftSection={<Icon name="columns-2" size="1rem" />}
        {...toggleProps(isDualPage, selectedNoteId)}
        disabled={singlePageOnly}
        onClick={() => !isDualPage && spreadActions.toggleSpreadMode()}
      >
        {t("viewer.dualPageView", "Dual Page View")}
      </Menu.Item>
      {/* From one page at a time, this goes straight to pairs with the cover alone. */}
      <Menu.Item
        leftSection={<Icon name="book" size="1rem" />}
        {...toggleProps(isCoverPage, selectedNoteId)}
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
      <Menu.Label>{t("workbenchBar.defaultZoom", "Default zoom")}</Menu.Label>
      {fits.map(([setting, level, icon, label]) => (
        <Menu.Item
          key={setting}
          leftSection={<Icon name={icon} size="1rem" />}
          {...toggleProps(
            preferences.defaultViewerZoom === setting,
            selectedNoteId,
          )}
          onClick={() => chooseDefaultZoom(setting, level)}
        >
          {label}
        </Menu.Item>
      ))}
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
          {...toggleProps(pdfRenderMode === mode, selectedNoteId)}
          onClick={() => setPdfRenderMode(mode)}
        >
          {label}
        </Menu.Item>
      ))}
    </BarMenu>
  );
}
