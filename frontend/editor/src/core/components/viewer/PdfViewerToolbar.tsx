import { useState, useEffect } from "react";
import {
  Paper,
  Group,
  Menu,
  NumberInput,
  Slider,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useViewer } from "@app/contexts/ViewerContext";
import { useIsPhone } from "@app/hooks/useIsMobile";
import { Tooltip } from "@app/components/shared/Tooltip";
import { ActionIcon } from "@app/ui/ActionIcon";
import "@app/components/viewer/PdfViewerToolbar.css";
import { Icon } from "@app/ui/Icon";

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
  /** Per-page labels from `/PageLabels`, index-aligned with the page order. */
  pageLabels?: string[] | null;
}

export function PdfViewerToolbar({
  currentPage = 1,
  totalPages: _totalPages = 1,
  onPageChange,
  pageLabels = null,
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
  const [isDualPageActive, setIsDualPageActive] = useState(
    spreadState.isDualPage,
  );

  const hasPageLabels = !!pageLabels?.some((label) => label.length > 0);
  // Mirrors the visible page as a label ("iv") when the document defines them,
  // otherwise as a plain index. Kept separate from `pageInput` because a label
  // is not a number and must survive intermediate (non-numeric) typing.
  const [labelInput, setLabelInput] = useState("");

  const currentPageLabel = hasPageLabels
    ? (pageLabels?.[scrollState.currentPage - 1] ??
      String(scrollState.currentPage))
    : "";
  const totalLabel = hasPageLabels
    ? (pageLabels?.[scrollState.totalPages - 1] ??
      String(scrollState.totalPages))
    : String(scrollState.totalPages);

  useEffect(() => {
    if (hasPageLabels) {
      setLabelInput(currentPageLabel);
    }
  }, [hasPageLabels, currentPageLabel]);

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
    });
    if (!zoomRestorePendingRef.current) {
      setDisplayZoomPercent(zoomState.zoomPercent || 100);
    }
    return () => {
      unregister?.();
    };
  }, [
    registerImmediateZoomUpdate,
    zoomState.zoomPercent,
    zoomRestorePendingRef,
    zoomRestoreSettledTick,
  ]);

  useEffect(() => {
    const unregister = registerImmediateSpreadUpdate((_mode, isDual) => {
      setIsDualPageActive(isDual);
    });
    setIsDualPageActive(spreadState.isDualPage);
    return () => {
      unregister?.();
    };
  }, [registerImmediateSpreadUpdate, spreadState.isDualPage]);

  const handleZoomOut = () => {
    zoomActions.zoomOut();
  };

  const handleZoomIn = () => {
    zoomActions.zoomIn();
  };

  const handlePageNavigation = (page: number) => {
    scrollActions.scrollToPage(page);
    if (onPageChange) {
      onPageChange(page);
    }
    setPageInput(page);
    // Show the destination label right away: the scroll plugin only mirrors a
    // programmatic jump into its scroll state once the smooth scroll settles,
    // so reading the label back from there would leave the field stale.
    if (hasPageLabels) {
      setLabelInput(pageLabels?.[page - 1] ?? String(page));
    }
  };

  // Accepts either a label ("iv") or a plain page index, matching what the
  // field shows; anything else reverts to the current page.
  const handleLabelNavigation = (raw: string) => {
    const value = raw.trim();
    const lower = value.toLowerCase();
    const byLabel =
      value && pageLabels
        ? pageLabels.findIndex((label) => label.toLowerCase() === lower)
        : -1;
    if (byLabel >= 0) {
      handlePageNavigation(byLabel + 1);
      return;
    }
    const page = Number(value);
    if (
      value.length > 0 &&
      !isNaN(page) &&
      page >= 1 &&
      page <= scrollState.totalPages
    ) {
      handlePageNavigation(page);
      return;
    }
    setLabelInput(currentPageLabel);
  };

  const handleDualPageToggle = () => {
    spreadActions.toggleSpreadMode();
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
  const labelInputWidth = Math.max(
    MIN_INPUT_WIDTH_PX,
    BASE_INPUT_WIDTH_PX + Math.max(1, labelInput.length) * PX_PER_DIGIT,
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
      {hasPageLabels ? (
        <TextInput
          value={labelInput}
          onChange={(event) => setLabelInput(event.currentTarget.value)}
          onBlur={(event) => handleLabelNavigation(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Blur commits through onBlur; navigating here as well would run the
            // jump twice. Skip while composing so an IME candidate is not taken
            // as the page text.
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.currentTarget.blur();
            }
          }}
          size="xs"
          title={t("viewer.thumbnails.pageNumber", "Page {{page}}", {
            page: labelInput || currentPageLabel,
          })}
          aria-label={t("viewer.thumbnails.pageNumber", "Page {{page}}", {
            page: labelInput || currentPageLabel,
          })}
          styles={{
            input: {
              width: labelInputWidth,
              textAlign: "center",
              fontWeight: 500,
              fontSize: 13,
              paddingLeft: 4,
              paddingRight: 4,
              boxSizing: "border-box",
            },
          }}
        />
      ) : (
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
      )}

      <span
        style={{
          fontWeight: 500,
          fontSize: 13,
          color: "var(--c-text-subtle)",
        }}
      >
        / {totalLabel}
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
