import { useState, useEffect } from "react";
import { Paper, Group, Menu, NumberInput, Slider } from "@mantine/core";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import { useTranslation } from "react-i18next";
import { SpreadMode } from "@embedpdf/plugin-spread/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useIsPhone } from "@editor/hooks/useIsMobile";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { ActionIcon } from "@editor/ui/ActionIcon";
import "@editor/components/viewer/PdfViewerToolbar.css";
import { Icon } from "@editor/ui/Icon";

// Sizing constants for the page number input
const MIN_PAGE_DIGITS = 2;
const MIN_INPUT_WIDTH_PX = 48;
const BASE_INPUT_WIDTH_PX = 32;
const PX_PER_DIGIT = 8;

interface PdfViewerToolbarProps {
  // Page navigation props (placeholders for now)
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function PdfViewerToolbar({
  currentPage = 1,
  totalPages: _totalPages = 1,
  onPageChange,
}: PdfViewerToolbarProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  // Phone keeps big hit targets; on desktop the bar sits at the rails' scale.
  const buttonMinWidth = isPhone ? "3rem" : undefined;
  const buttonSize = isPhone ? "lg" : "sm";
  const {
    getScrollState,
    getZoomState,
    getSpreadState,
    scrollActions,
    zoomActions,
    spreadActions,
    zoomRestorePendingRef,
    zoomRestoreSettledTick,
    registerImmediateZoomUpdate,
    registerImmediateScrollUpdate,
    registerImmediateSpreadUpdate,
    pdfRenderMode,
    cyclePdfRenderMode,
  } = useViewer();

  const scrollState = getScrollState();
  const zoomState = getZoomState();
  const spreadState = getSpreadState();
  const [pageInput, setPageInput] = useState(
    scrollState.currentPage || currentPage,
  );
  const [displayZoomPercent, setDisplayZoomPercent] = useState(
    () => zoomState.zoomPercent || 100,
  );

  const [zoomLevel, setZoomLevel] = useState(() => zoomState.level);
  const [spreadMode, setSpreadMode] = useState(spreadState.spreadMode);
  const isDualPageActive = spreadMode !== SpreadMode.None;
  const isCoverPageActive = spreadMode === SpreadMode.Even;

  // Register for immediate scroll updates and sync with actual scroll state
  useEffect(() => {
    const unregister = registerImmediateScrollUpdate(
      (currentPage, _totalPages) => {
        setPageInput(currentPage);
      },
    );
    setPageInput(scrollState.currentPage);
    return () => {
      unregister?.();
    };
  }, [registerImmediateScrollUpdate, scrollState.currentPage]);

  // A carried zoom's fit pass is intermediate, so the readout holds until its
  // settled tick re-syncs from the live state.
  useEffect(() => {
    const unregister = registerImmediateZoomUpdate((percent) => {
      if (zoomRestorePendingRef.current) return;
      setDisplayZoomPercent(percent);
      setZoomLevel(getZoomState().level);
    });
    if (!zoomRestorePendingRef.current) {
      setDisplayZoomPercent(zoomState.zoomPercent || 100);
      setZoomLevel(zoomState.level);
    }
    return () => {
      unregister?.();
    };
  }, [
    registerImmediateZoomUpdate,
    getZoomState,
    zoomState.zoomPercent,
    zoomState.level,
    zoomRestorePendingRef,
    zoomRestoreSettledTick,
  ]);

  const isFitWidthActive = zoomLevel === ZoomMode.FitWidth;
  const isFitPageActive = zoomLevel === ZoomMode.FitPage;

  useEffect(() => {
    const unregister = registerImmediateSpreadUpdate((mode) => {
      setSpreadMode(mode);
    });
    setSpreadMode(spreadState.spreadMode);
    return () => {
      unregister?.();
    };
  }, [registerImmediateSpreadUpdate, spreadState.spreadMode]);

  const handleZoomOut = () => {
    zoomActions.zoomOut();
  };

  const handleZoomIn = () => {
    zoomActions.zoomIn();
  };

  const handleFitWidth = () => {
    zoomActions.requestZoom(ZoomMode.FitWidth);
  };

  const handleFitPage = () => {
    zoomActions.requestZoom(ZoomMode.FitPage);
  };

  const handlePageNavigation = (page: number) => {
    scrollActions.scrollToPage(page);
    if (onPageChange) {
      onPageChange(page);
    }
    setPageInput(page);
  };

  const handleDualPageToggle = () => {
    spreadActions.toggleSpreadMode();
  };

  const handleCoverPageToggle = () => {
    spreadActions.setSpreadMode(
      isCoverPageActive ? SpreadMode.Odd : SpreadMode.Even,
    );
  };

  const handleFirstPage = () => {
    scrollActions.scrollToFirstPage();
  };

  const handlePreviousPage = () => {
    const { currentPage: cur } = getScrollState();
    if (cur > 1) scrollActions.scrollToPage(cur - 1);
  };

  const handleNextPage = () => {
    const { currentPage: cur, totalPages: tot } = getScrollState();
    if (cur < tot) scrollActions.scrollToPage(cur + 1);
  };

  const handleLastPage = () => {
    scrollActions.scrollToLastPage();
  };

  const totalPagesDigits = Math.max(
    MIN_PAGE_DIGITS,
    (scrollState.totalPages || 1).toString().length,
  );
  const inputWidth = Math.max(
    MIN_INPUT_WIDTH_PX,
    BASE_INPUT_WIDTH_PX + totalPagesDigits * PX_PER_DIGIT,
  );

  return (
    <Paper
      className="pdf-viewer-toolbar"
      px={10}
      py={6}
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        rowGap: 4,
        gap: 6,
        justifyContent: "center",
        pointerEvents: "auto",
      }}
    >
      {/* First Page Button */}
      {!isPhone && (
        <ActionIcon
          variant="tertiary"
          size={buttonSize}
          className="pdf-viewer-toolbar-wide-only"
          onClick={handleFirstPage}
          disabled={scrollState.currentPage === 1}
          style={{ minWidth: buttonMinWidth }}
          title={t("viewer.firstPage", "First Page")}
          aria-label={t("viewer.firstPage", "First Page")}
        >
          <Icon name="chevron-first" size={18} />
        </ActionIcon>
      )}

      {/* Previous Page Button */}
      <ActionIcon
        variant="tertiary"
        size={buttonSize}
        onClick={handlePreviousPage}
        disabled={scrollState.currentPage === 1}
        style={{ minWidth: buttonMinWidth }}
        title={t("viewer.previousPage", "Previous Page")}
        aria-label={t("viewer.previousPage", "Previous Page")}
      >
        <Icon name="chevron-left" size={18} />
      </ActionIcon>

      {/* Page Input */}
      <NumberInput
        value={pageInput}
        onChange={(value) => {
          const page = Number(value);
          setPageInput(page);
          if (!isNaN(page) && page >= 1 && page <= scrollState.totalPages) {
            handlePageNavigation(page);
          }
        }}
        min={1}
        max={scrollState.totalPages}
        hideControls
        size="xs"
        styles={{
          input: {
            width: inputWidth,
            textAlign: "center",
            fontWeight: 500,
            fontSize: 13,
            paddingLeft: 4,
            paddingRight: 4,
            boxSizing: "border-box",
          },
        }}
      />

      <span
        style={{
          fontWeight: 500,
          fontSize: 13,
          color: "var(--c-text-subtle)",
        }}
      >
        / {scrollState.totalPages}
      </span>

      {/* Next Page Button */}
      <ActionIcon
        variant="tertiary"
        size={buttonSize}
        onClick={handleNextPage}
        disabled={scrollState.currentPage === scrollState.totalPages}
        style={{ minWidth: buttonMinWidth }}
        title={t("viewer.nextPage", "Next Page")}
        aria-label={t("viewer.nextPage", "Next Page")}
      >
        <Icon name="chevron-right" size={18} />
      </ActionIcon>

      {/* Last Page Button */}
      {!isPhone && (
        <ActionIcon
          variant="tertiary"
          size={buttonSize}
          className="pdf-viewer-toolbar-wide-only"
          onClick={handleLastPage}
          disabled={scrollState.currentPage === scrollState.totalPages}
          style={{ minWidth: buttonMinWidth }}
          title={t("viewer.lastPage", "Last Page")}
          aria-label={t("viewer.lastPage", "Last Page")}
        >
          <Icon name="chevron-last" size={18} />
        </ActionIcon>
      )}

      {/* Hairline between the groups, as the rails divide theirs. */}
      {!isPhone && (
        <div className="pdf-viewer-toolbar__divider pdf-viewer-toolbar-wide-only" />
      )}

      {/* Dual Page Toggle */}
      {!isPhone && (
        <Tooltip
          content={
            isDualPageActive
              ? t("viewer.singlePageView", "Single Page View")
              : t("viewer.dualPageView", "Dual Page View")
          }
          position="top"
          arrow
        >
          <ActionIcon
            variant={isDualPageActive ? "primary" : "tertiary"}
            size={buttonSize}
            className="pdf-viewer-toolbar-wide-only"
            onClick={handleDualPageToggle}
            disabled={scrollState.totalPages <= 1}
            style={{ minWidth: buttonMinWidth }}
            aria-label={
              isDualPageActive
                ? t("viewer.singlePageView", "Single Page View")
                : t("viewer.dualPageView", "Dual Page View")
            }
          >
            {isDualPageActive ? (
              <Icon name="file-text" size={18} />
            ) : (
              <Icon name="columns-2" size={18} />
            )}
          </ActionIcon>
        </Tooltip>
      )}

      {!isPhone && isDualPageActive && (
        <Tooltip
          content={t("viewer.coverPageView", "Show Cover Page Separately")}
          position="top"
          arrow
        >
          <ActionIcon
            variant={isCoverPageActive ? "primary" : "tertiary"}
            size={buttonSize}
            className="pdf-viewer-toolbar-wide-only"
            onClick={handleCoverPageToggle}
            disabled={scrollState.totalPages <= 1}
            style={{ minWidth: buttonMinWidth }}
            aria-pressed={isCoverPageActive}
            aria-label={t("viewer.coverPageView", "Show Cover Page Separately")}
          >
            <Icon name="book" size={18} />
          </ActionIcon>
        </Tooltip>
      )}

      {/* PDF Render Mode Toggle */}
      {!isPhone && (
        <Tooltip
          content={
            pdfRenderMode === "normal"
              ? t("viewer.enableDarkFilter", "Enable Dark Filter")
              : pdfRenderMode === "dark"
                ? t("viewer.enableSepiaFilter", "Enable Sepia Filter")
                : t("viewer.disableColorFilter", "Disable Color Filter")
          }
          position="top"
          arrow
        >
          <ActionIcon
            variant={pdfRenderMode !== "normal" ? "primary" : "tertiary"}
            size={buttonSize}
            className="pdf-viewer-toolbar-wide-only"
            onClick={cyclePdfRenderMode}
            style={{ minWidth: buttonMinWidth }}
            aria-label={
              pdfRenderMode === "normal"
                ? t("viewer.enableDarkFilter", "Enable Dark Filter")
                : pdfRenderMode === "dark"
                  ? t("viewer.enableSepiaFilter", "Enable Sepia Filter")
                  : t("viewer.disableColorFilter", "Disable Color Filter")
            }
          >
            {pdfRenderMode === "normal" && <Icon name="moon" size={18} />}
            {pdfRenderMode === "dark" && <Icon name="sunset" size={18} />}
            {pdfRenderMode === "sepia" && <Icon name="sun" size={18} />}
          </ActionIcon>
        </Tooltip>
      )}

      {/* Desktop zoom controls (slider + buttons) */}
      {!isPhone && (
        <Group gap={4} align="center" wrap="nowrap" style={{ flexShrink: 0 }}>
          <div className="pdf-viewer-toolbar__divider" />
          <ActionIcon
            variant="tertiary"
            size={buttonSize}
            onClick={handleZoomOut}
            aria-label={t("viewer.zoomOut", "Zoom out")}
          >
            <Icon name="zoom-out" size={18} />
          </ActionIcon>
          <Slider
            className="pdf-viewer-toolbar-zoom-slider"
            value={Math.min(Math.max(displayZoomPercent, 20), 500)}
            min={20}
            max={500}
            step={5}
            onChange={(val) => zoomActions.setZoomLevel?.(val / 100)}
            size="xs"
            styles={{
              root: { minWidth: "6rem", width: "6rem", flexShrink: 0 },
              thumb: { width: 12, height: 12 },
              track: { height: 2 },
            }}
            label={null}
          />
          <ActionIcon
            variant="tertiary"
            size={buttonSize}
            onClick={handleZoomIn}
            aria-label={t("viewer.zoomIn", "Zoom in")}
          >
            <Icon name="zoom-in" size={18} />
          </ActionIcon>
          <span
            style={{
              minWidth: "2.5rem",
              textAlign: "center",
              fontSize: 12,
              color: "var(--c-text-subtle)",
            }}
          >
            {displayZoomPercent}%
          </span>
          <Tooltip
            content={t("viewer.fitWidth", "Fit to width")}
            position="top"
            arrow
          >
            <ActionIcon
              variant={isFitWidthActive ? "primary" : "tertiary"}
              size={buttonSize}
              onClick={handleFitWidth}
              aria-label={t("viewer.fitWidth", "Fit to width")}
              aria-pressed={isFitWidthActive}
            >
              <Icon name="arrow-left-right" size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            content={t("viewer.fitPage", "Fit to page")}
            position="top"
            arrow
          >
            <ActionIcon
              variant={isFitPageActive ? "primary" : "tertiary"}
              size={buttonSize}
              onClick={handleFitPage}
              aria-label={t("viewer.fitPage", "Fit to page")}
              aria-pressed={isFitPageActive}
            >
              <Icon name="scan" size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}

      {isPhone && (
        <Menu
          shadow="md"
          width={240}
          position="top-end"
          closeOnItemClick={false}
        >
          <Menu.Target>
            <ActionIcon
              variant="secondary"
              size="lg"
              aria-label={t("viewer.moreOptions", "More")}
              style={{ marginLeft: 4 }}
            >
              <Icon name="ellipsis-vertical" size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>
              {t("viewer.pageNavigation", "Page navigation")}
            </Menu.Label>
            <Menu.Item
              leftSection={<Icon name="chevron-first" size={18} />}
              disabled={scrollState.currentPage === 1}
              onClick={handleFirstPage}
            >
              {t("viewer.firstPage", "First page")}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="chevron-last" size={18} />}
              disabled={scrollState.currentPage === scrollState.totalPages}
              onClick={handleLastPage}
            >
              {t("viewer.lastPage", "Last page")}
            </Menu.Item>

            <Menu.Divider />
            <Menu.Label>{t("viewer.zoom", "Zoom")}</Menu.Label>
            <Menu.Item
              leftSection={<Icon name="zoom-out" size={18} />}
              onClick={handleZoomOut}
            >
              {t("viewer.zoomOut", "Zoom out")}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="zoom-in" size={18} />}
              onClick={handleZoomIn}
            >
              {t("viewer.zoomIn", "Zoom in")} ({displayZoomPercent}%)
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="arrow-left-right" size={18} />}
              rightSection={isFitWidthActive && <Icon name="check" size={16} />}
              aria-current={isFitWidthActive || undefined}
              onClick={handleFitWidth}
            >
              {t("viewer.fitWidth", "Fit to width")}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="scan" size={18} />}
              rightSection={isFitPageActive && <Icon name="check" size={16} />}
              aria-current={isFitPageActive || undefined}
              onClick={handleFitPage}
            >
              {t("viewer.fitPage", "Fit to page")}
            </Menu.Item>

            <Menu.Divider />
            <Menu.Label>{t("viewer.view", "View")}</Menu.Label>
            <Menu.Item
              leftSection={
                isDualPageActive ? (
                  <Icon name="file-text" size={18} />
                ) : (
                  <Icon name="columns-2" size={18} />
                )
              }
              disabled={scrollState.totalPages <= 1}
              onClick={handleDualPageToggle}
            >
              {isDualPageActive
                ? t("viewer.singlePageView", "Single Page View")
                : t("viewer.dualPageView", "Dual Page View")}
            </Menu.Item>
            {isDualPageActive && (
              <Menu.Item
                leftSection={<Icon name="book" size={18} />}
                rightSection={
                  isCoverPageActive && <Icon name="check" size={16} />
                }
                disabled={scrollState.totalPages <= 1}
                onClick={handleCoverPageToggle}
              >
                {t("viewer.coverPageView", "Show Cover Page Separately")}
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={
                pdfRenderMode === "normal" ? (
                  <Icon name="moon" size={18} />
                ) : pdfRenderMode === "dark" ? (
                  <Icon name="sunset" size={18} />
                ) : (
                  <Icon name="sun" size={18} />
                )
              }
              onClick={cyclePdfRenderMode}
            >
              {pdfRenderMode === "normal"
                ? t("viewer.enableDarkFilter", "Enable Dark Filter")
                : pdfRenderMode === "dark"
                  ? t("viewer.enableSepiaFilter", "Enable Sepia Filter")
                  : t("viewer.disableColorFilter", "Disable Color Filter")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Paper>
  );
}
