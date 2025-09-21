import React, { useState, useEffect } from 'react';
import { Button, Paper, Group, NumberInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useViewer } from '../../contexts/ViewerContext';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import LastPageIcon from '@mui/icons-material/LastPage';
import DescriptionIcon from '@mui/icons-material/Description';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';

interface PdfViewerToolbarProps {
  // Page navigation props (placeholders for now)
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  
  // Dual page toggle (placeholder for now)
  dualPage?: boolean;
  onDualPageToggle?: () => void;
  
  // Zoom controls (connected via ViewerContext)
  currentZoom?: number;
}

export function PdfViewerToolbar({
  currentPage = 1,
  totalPages: _totalPages = 1,
  onPageChange,
  dualPage = false,
  onDualPageToggle,
  currentZoom: _currentZoom = 100,
}: PdfViewerToolbarProps) {
  const { t } = useTranslation();
  const { getScrollState, getZoomState, scrollActions, zoomActions, registerImmediateZoomUpdate, registerImmediateScrollUpdate } = useViewer();
  
  const scrollState = getScrollState();
  const zoomState = getZoomState();
  const [pageInput, setPageInput] = useState(scrollState.currentPage || currentPage);
  const [displayZoomPercent, setDisplayZoomPercent] = useState(zoomState.zoomPercent || 140);

  // Register for immediate scroll updates and sync with actual scroll state
  useEffect(() => {
    registerImmediateScrollUpdate((currentPage, _totalPages) => {
      setPageInput(currentPage);
    });
    setPageInput(scrollState.currentPage);
  }, [registerImmediateScrollUpdate]);

  // Register for immediate zoom updates and sync with actual zoom state
  useEffect(() => {
    registerImmediateZoomUpdate(setDisplayZoomPercent);
    setDisplayZoomPercent(zoomState.zoomPercent || 140);
  }, [zoomState.zoomPercent, registerImmediateZoomUpdate]);

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

  const handleFirstPage = () => {
    scrollActions.scrollToFirstPage();
  };

  const handlePreviousPage = () => {
    scrollActions.scrollToPreviousPage();
  };

  const handleNextPage = () => {
    scrollActions.scrollToNextPage();
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
          gap: 10,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          boxShadow: "0 -2px 8px rgba(0,0,0,0.04)",
          pointerEvents: "auto",
          minWidth: '26.5rem',
        }}
      >
        {/* First Page Button */}
        <Button
          variant="subtle"
          color="blue"
          size="md"
          px={8}
          radius="xl"
          onClick={handleFirstPage}
          disabled={scrollState.currentPage === 1}
          style={{ minWidth: '2.5rem' }}
          title={t("viewer.firstPage", "First Page")}
        >
          <FirstPageIcon fontSize="small" />
        </Button>

        {/* Previous Page Button */}
        <Button
          variant="subtle"
          color="blue"
          size="md"
          px={8}
          radius="xl"
          onClick={handlePreviousPage}
          disabled={scrollState.currentPage === 1}
          style={{ minWidth: '2.5rem' }}
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
            input: { width: 48, textAlign: "center", fontWeight: 500, fontSize: 16 },
          }}
        />
        
        <span style={{ fontWeight: 500, fontSize: 16 }}>
          / {scrollState.totalPages}
        </span>

        {/* Next Page Button */}
        <Button
          variant="subtle"
          color="blue"
          size="md"
          px={8}
          radius="xl"
          onClick={handleNextPage}
          disabled={scrollState.currentPage === scrollState.totalPages}
          style={{ minWidth: '2.5rem' }}
          title={t("viewer.nextPage", "Next Page")}
        >
          <ArrowForwardIosIcon fontSize="small" />
        </Button>

        {/* Last Page Button */}
        <Button
          variant="subtle"
          color="blue"
          size="md"
          px={8}
          radius="xl"
          onClick={handleLastPage}
          disabled={scrollState.currentPage === scrollState.totalPages}
          style={{ minWidth: '2.5rem' }}
          title={t("viewer.lastPage", "Last Page")}
        >
          <LastPageIcon fontSize="small" />
        </Button>

        {/* Dual Page Toggle */}
        <Button
          variant={dualPage ? "filled" : "light"}
          color="blue"
          size="md"
          radius="xl"
          onClick={onDualPageToggle}
          style={{ minWidth: '2.5rem' }}
          title={dualPage ? t("viewer.singlePageView", "Single Page View") : t("viewer.dualPageView", "Dual Page View")}
        >
          {dualPage ? <DescriptionIcon fontSize="small" /> : <ViewWeekIcon fontSize="small" />}
        </Button>

        {/* Zoom Controls */}
        <Group gap={4} align="center" style={{ marginLeft: 16 }}>
          <Button
            variant="subtle"
            color="blue"
            size="md"
            radius="xl"
            onClick={handleZoomOut}
            style={{ minWidth: '2rem', padding: 0 }}
            title={t("viewer.zoomOut", "Zoom out")}
          >
            −
          </Button>
          <span style={{ minWidth: '2.5rem', textAlign: "center" }}>
            {displayZoomPercent}%
          </span>
          <Button
            variant="subtle"
            color="blue"
            size="md"
            radius="xl"
            onClick={handleZoomIn}
            style={{ minWidth: '2rem', padding: 0 }}
            title={t("viewer.zoomIn", "Zoom in")}
          >
            +
          </Button>
        </Group>
      </Paper>
  );
}