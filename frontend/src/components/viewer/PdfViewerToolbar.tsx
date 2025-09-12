import React, { useState, useEffect } from 'react';
import { Button, Paper, Group, NumberInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
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
  
  // Zoom controls (will connect to window.embedPdfZoom)
  currentZoom?: number;
}

export function PdfViewerToolbar({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  dualPage = false,
  onDualPageToggle,
  currentZoom = 100,
}: PdfViewerToolbarProps) {
  const { t } = useTranslation();
  const [pageInput, setPageInput] = useState(currentPage);
  const [dynamicZoom, setDynamicZoom] = useState(currentZoom);
  const [dynamicPage, setDynamicPage] = useState(currentPage);
  const [dynamicTotalPages, setDynamicTotalPages] = useState(totalPages);
  const [isPanning, setIsPanning] = useState(false);

  // Update zoom and scroll state from EmbedPDF APIs
  useEffect(() => {
    const updateState = () => {
      // Update zoom
      if ((window as any).embedPdfZoom) {
        const zoomPercent = (window as any).embedPdfZoom.zoomPercent || currentZoom;
        setDynamicZoom(zoomPercent);
      }
      
      // Update scroll/page state
      if ((window as any).embedPdfScroll) {
        const currentPageNum = (window as any).embedPdfScroll.currentPage || currentPage;
        const totalPagesNum = (window as any).embedPdfScroll.totalPages || totalPages;
        setDynamicPage(currentPageNum);
        setDynamicTotalPages(totalPagesNum);
        setPageInput(currentPageNum);
      }
      
      // Update pan mode state
      if ((window as any).embedPdfPan) {
        const panState = (window as any).embedPdfPan.isPanning || false;
        setIsPanning(panState);
      }
    };

    // Update state immediately
    updateState();

    // Set up periodic updates to keep state in sync
    const interval = setInterval(updateState, 200);
    
    return () => clearInterval(interval);
  }, [currentZoom, currentPage, totalPages]);

  const handleZoomOut = () => {
    if ((window as any).embedPdfZoom) {
      (window as any).embedPdfZoom.zoomOut();
    }
  };

  const handleZoomIn = () => {
    if ((window as any).embedPdfZoom) {
      (window as any).embedPdfZoom.zoomIn();
    }
  };

  const handlePageNavigation = (page: number) => {
    if ((window as any).embedPdfScroll) {
      (window as any).embedPdfScroll.scrollToPage(page);
    } else if (onPageChange) {
      onPageChange(page);
    }
    setPageInput(page);
  };

  const handleFirstPage = () => {
    if ((window as any).embedPdfScroll) {
      (window as any).embedPdfScroll.scrollToFirstPage();
    } else {
      handlePageNavigation(1);
    }
  };

  const handlePreviousPage = () => {
    if ((window as any).embedPdfScroll) {
      (window as any).embedPdfScroll.scrollToPreviousPage();
    } else {
      handlePageNavigation(Math.max(1, dynamicPage - 1));
    }
  };

  const handleNextPage = () => {
    if ((window as any).embedPdfScroll) {
      (window as any).embedPdfScroll.scrollToNextPage();
    } else {
      handlePageNavigation(Math.min(dynamicTotalPages, dynamicPage + 1));
    }
  };

  const handleLastPage = () => {
    if ((window as any).embedPdfScroll) {
      (window as any).embedPdfScroll.scrollToLastPage();
    } else {
      handlePageNavigation(dynamicTotalPages);
    }
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
          disabled={dynamicPage === 1}
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
          disabled={dynamicPage === 1}
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
            if (!isNaN(page) && page >= 1 && page <= dynamicTotalPages) {
              handlePageNavigation(page);
            }
          }}
          min={1}
          max={dynamicTotalPages}
          hideControls
          styles={{
            input: { width: 48, textAlign: "center", fontWeight: 500, fontSize: 16 },
          }}
        />
        
        <span style={{ fontWeight: 500, fontSize: 16 }}>
          / {dynamicTotalPages}
        </span>

        {/* Next Page Button */}
        <Button
          variant="subtle"
          color="blue"
          size="md"
          px={8}
          radius="xl"
          onClick={handleNextPage}
          disabled={dynamicPage === dynamicTotalPages}
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
          disabled={dynamicPage === dynamicTotalPages}
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
            {dynamicZoom}%
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