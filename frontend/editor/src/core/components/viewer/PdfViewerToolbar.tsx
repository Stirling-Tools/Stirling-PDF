import { useState, useEffect } from "react";
import {
  ActionIcon,
  Button,
  Paper,
  Group,
  Menu,
  NumberInput,
  Slider,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useViewer } from "@app/contexts/ViewerContext";
import { useIsPhone } from "@app/hooks/useIsMobile";
import { Tooltip } from "@app/components/shared/Tooltip";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import LastPageIcon from "@mui/icons-material/LastPage";
import DescriptionIcon from "@mui/icons-material/Description";
import ViewWeekIcon from "@mui/icons-material/ViewWeek";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import WbSunnyIcon from "@mui/icons-material/WbSunny";
import WbTwilightIcon from "@mui/icons-material/WbTwilight";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import MoreVertIcon from "@mui/icons-material/MoreVert";

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
  const buttonMinWidth = isPhone ? "3rem" : "2.5rem";
  const buttonSize = isPhone ? "lg" : "md";
  const {
    getScrollState,
    getZoomState,
    getSpreadState,
    scrollActions,
    zoomActions,
    spreadActions,
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
    zoomState.zoomPercent || 140,
  );
  const [isDualPageActive, setIsDualPageActive] = useState(
    spreadState.isDualPage,
  );

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

  // Register for immediate zoom updates and sync with actual zoom state
  useEffect(() => {
    const unregister = registerImmediateZoomUpdate(setDisplayZoomPercent);
    setDisplayZoomPercent(zoomState.zoomPercent || 140);
    return () => {
      unregister?.();
    };
  }, [registerImmediateZoomUpdate, zoomState.zoomPercent]);

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

  return (
    <Paper
      radius="xl xl 0 0"
      shadow="sm"
      p={12}
      pb={12}
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        rowGap: 8,
        gap: 10,
        justifyContent: "center",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        boxShadow: "0 -2px 8px rgba(0,0,0,0.04)",
        pointerEvents: "auto",
      }}
    >
      {/* First Page Button */}
      {!isPhone && (
        <Button
          variant="subtle"
          color="blue"
          size={buttonSize}
          px={8}
          radius="xl"
          onClick={handleFirstPage}
          disabled={scrollState.currentPage === 1}
          style={{ minWidth: buttonMinWidth }}
          title={t("viewer.firstPage", "First Page")}
        >
          <FirstPageIcon fontSize="small" />
        </Button>
      )}

      {/* Previous Page Button */}
      <Button
        variant="subtle"
        color="blue"
        size={buttonSize}
        px={8}
        radius="xl"
        onClick={handlePreviousPage}
        disabled={scrollState.currentPage === 1}
        style={{ minWidth: buttonMinWidth }}
        title={t("viewer.previousPage", "Previous Page")}
      >
        <ArrowBackIosIcon fontSize="small" />
      </Button>

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
        styles={{
          input: {
            width: 48,
            textAlign: "center",
            fontWeight: 500,
            fontSize: 16,
          },
        }}
      />

      <span style={{ fontWeight: 500, fontSize: 16 }}>
        / {scrollState.totalPages}
      </span>

      {/* Next Page Button */}
      <Button
        variant="subtle"
        color="blue"
        size={buttonSize}
        px={8}
        radius="xl"
        onClick={handleNextPage}
        disabled={scrollState.currentPage === scrollState.totalPages}
        style={{ minWidth: buttonMinWidth }}
        title={t("viewer.nextPage", "Next Page")}
      >
        <ArrowForwardIosIcon fontSize="small" />
      </Button>

      {/* Last Page Button */}
      {!isPhone && (
        <Button
          variant="subtle"
          color="blue"
          size={buttonSize}
          px={8}
          radius="xl"
          onClick={handleLastPage}
          disabled={scrollState.currentPage === scrollState.totalPages}
          style={{ minWidth: buttonMinWidth }}
          title={t("viewer.lastPage", "Last Page")}
        >
          <LastPageIcon fontSize="small" />
        </Button>
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
          <Button
            variant={isDualPageActive ? "filled" : "light"}
            color="blue"
            size={buttonSize}
            radius="xl"
            onClick={handleDualPageToggle}
            disabled={scrollState.totalPages <= 1}
            style={{ minWidth: buttonMinWidth }}
          >
            {isDualPageActive ? (
              <DescriptionIcon fontSize="small" />
            ) : (
              <ViewWeekIcon fontSize="small" />
            )}
          </Button>
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
          <Button
            variant={pdfRenderMode !== "normal" ? "filled" : "light"}
            color="blue"
            size={buttonSize}
            radius="xl"
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
            {pdfRenderMode === "normal" && <DarkModeIcon fontSize="small" />}
            {pdfRenderMode === "dark" && <WbTwilightIcon fontSize="small" />}
            {pdfRenderMode === "sepia" && <WbSunnyIcon fontSize="small" />}
          </Button>
        </Tooltip>
      )}

      {/* Desktop zoom controls (slider + buttons) */}
      {!isPhone && (
        <Group
          gap={4}
          align="center"
          wrap="nowrap"
          style={{ marginLeft: 16, flexShrink: 0 }}
        >
          <ActionIcon
            variant="subtle"
            color="blue"
            radius="md"
            onClick={handleZoomOut}
            aria-label={t("viewer.zoomOut", "Zoom out")}
          >
            <ZoomOutIcon fontSize="small" />
          </ActionIcon>
          <Slider
            value={Math.min(Math.max(displayZoomPercent, 20), 500)}
            min={20}
            max={500}
            step={5}
            onChange={(val) => zoomActions.setZoomLevel?.(val / 100)}
            size="xs"
            styles={{
              root: { minWidth: "6rem", width: "6rem", flexShrink: 0 },
              thumb: { width: 14, height: 14 },
              track: { height: 3 },
            }}
            label={null}
          />
          <ActionIcon
            variant="subtle"
            color="blue"
            radius="md"
            onClick={handleZoomIn}
            aria-label={t("viewer.zoomIn", "Zoom in")}
          >
            <ZoomInIcon fontSize="small" />
          </ActionIcon>
          <span
            style={{
              minWidth: "2.5rem",
              textAlign: "center",
              fontSize: 12,
              color: "var(--text-muted)",
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
              variant="light"
              color="blue"
              radius="md"
              size="lg"
              aria-label={t("viewer.moreOptions", "More")}
              style={{ marginLeft: 4 }}
            >
              <MoreVertIcon fontSize="small" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>
              {t("viewer.pageNavigation", "Page navigation")}
            </Menu.Label>
            <Menu.Item
              leftSection={<FirstPageIcon fontSize="small" />}
              disabled={scrollState.currentPage === 1}
              onClick={handleFirstPage}
            >
              {t("viewer.firstPage", "First page")}
            </Menu.Item>
            <Menu.Item
              leftSection={<LastPageIcon fontSize="small" />}
              disabled={scrollState.currentPage === scrollState.totalPages}
              onClick={handleLastPage}
            >
              {t("viewer.lastPage", "Last page")}
            </Menu.Item>

            <Menu.Divider />
            <Menu.Label>{t("viewer.zoom", "Zoom")}</Menu.Label>
            <Menu.Item
              leftSection={<ZoomOutIcon fontSize="small" />}
              onClick={handleZoomOut}
            >
              {t("viewer.zoomOut", "Zoom out")}
            </Menu.Item>
            <Menu.Item
              leftSection={<ZoomInIcon fontSize="small" />}
              onClick={handleZoomIn}
            >
              {t("viewer.zoomIn", "Zoom in")} ({displayZoomPercent}%)
            </Menu.Item>

            <Menu.Divider />
            <Menu.Label>{t("viewer.view", "View")}</Menu.Label>
            <Menu.Item
              leftSection={
                isDualPageActive ? (
                  <DescriptionIcon fontSize="small" />
                ) : (
                  <ViewWeekIcon fontSize="small" />
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
                  <DarkModeIcon fontSize="small" />
                ) : pdfRenderMode === "dark" ? (
                  <WbTwilightIcon fontSize="small" />
                ) : (
                  <WbSunnyIcon fontSize="small" />
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
