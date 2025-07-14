import React, { useEffect, useState, useRef } from "react";
import { Paper, Stack, Text, ScrollArea, Loader, Center, Button, Group, NumberInput, useMantineTheme, ActionIcon, Box } from "@mantine/core";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { useTranslation } from "react-i18next";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import LastPageIcon from "@mui/icons-material/LastPage";
import ViewSidebarIcon from "@mui/icons-material/ViewSidebar";
import ViewWeekIcon from "@mui/icons-material/ViewWeek"; // for dual page (book)
import DescriptionIcon from "@mui/icons-material/Description"; // for single page
import CloseIcon from "@mui/icons-material/Close";
import { useLocalStorage } from "@mantine/hooks";
import { fileStorage } from "../../services/fileStorage";
import SkeletonLoader from '../shared/SkeletonLoader';
import { useFileContext } from "../../contexts/FileContext";
import { useFileWithUrl } from "../../hooks/useFileWithUrl";

GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

// Lazy loading page image component
interface LazyPageImageProps {
  pageIndex: number;
  zoom: number;
  theme: any;
  isFirst: boolean;
  renderPage: (pageIndex: number) => Promise<string | null>;
  pageImages: (string | null)[];
  setPageRef: (index: number, ref: HTMLImageElement | null) => void;
}

const LazyPageImage = ({
  pageIndex, zoom, theme, isFirst, renderPage, pageImages, setPageRef
}: LazyPageImageProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !imageUrl) {
            setIsVisible(true);
          }
        });
      },
      {
        rootMargin: '200px', // Start loading 200px before visible
        threshold: 0.1
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [imageUrl]);

  // Update local state when pageImages changes (from preloading)
  useEffect(() => {
    if (pageImages[pageIndex]) {
      setImageUrl(pageImages[pageIndex]);
    }
  }, [pageImages, pageIndex]);

  useEffect(() => {
    if (isVisible && !imageUrl) {
      renderPage(pageIndex).then((url) => {
        if (url) setImageUrl(url);
      });
    }
  }, [isVisible, imageUrl, pageIndex, renderPage]);

  useEffect(() => {
    if (imgRef.current) {
      setPageRef(pageIndex, imgRef.current);
    }
  }, [pageIndex, setPageRef]);

  if (imageUrl) {
    return (
      <img
        ref={imgRef}
        src={imageUrl}
        alt={`Page ${pageIndex + 1}`}
        style={{
          width: `${100 * zoom}%`,
          maxWidth: 700 * zoom,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          borderRadius: 8,
          marginTop: isFirst ? theme.spacing.xl : 0,
        }}
      />
    );
  }

  // Placeholder while loading
  return (
    <div
      ref={imgRef}
      style={{
        width: `${100 * zoom}%`,
        maxWidth: 700 * zoom,
        height: 800 * zoom, // Estimated height
        backgroundColor: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        marginTop: isFirst ? theme.spacing.xl : 0,
        border: '1px dashed #ccc'
      }}
    >
      {isVisible ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 20,
            height: 20,
            border: '2px solid #ddd',
            borderTop: '2px solid #666',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 8px'
          }} />
          <Text size="sm" c="dimmed">Loading page {pageIndex + 1}...</Text>
        </div>
      ) : (
        <Text size="sm" c="dimmed">Page {pageIndex + 1}</Text>
      )}
    </div>
  );
};

export interface ViewerProps {
  sidebarsVisible: boolean;
  setSidebarsVisible: (v: boolean) => void;
  onClose?: () => void;
  previewFile?: File; // For preview mode - bypasses context
}

const Viewer = ({
  sidebarsVisible,
  setSidebarsVisible,
  onClose,
  previewFile,
}: ViewerProps) => {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  
  // Get current file from FileContext
  const { getCurrentFile, getCurrentProcessedFile, clearAllFiles, addFiles } = useFileContext();
  const currentFile = getCurrentFile();
  const processedFile = getCurrentProcessedFile();
  
  // Convert File to FileWithUrl format for viewer
  const pdfFile = useFileWithUrl(currentFile);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [dualPage, setDualPage] = useState(false);
  const [zoom, setZoom] = useState(1); // 1 = 100%
  const pageRefs = useRef<(HTMLImageElement | null)[]>([]);


  // Use preview file if available, otherwise use context file
  const effectiveFile = React.useMemo(() => {
    if (previewFile) {
      // Validate the preview file
      if (!(previewFile instanceof File)) {
        return null;
      }
      
      if (previewFile.size === 0) {
        return null;
      }
      
      return { file: previewFile, url: null };
    } else {
      return pdfFile;
    }
  }, [previewFile, pdfFile]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isManualNavigationRef = useRef(false);
  const pdfDocRef = useRef<any>(null);
  const renderingPagesRef = useRef<Set<number>>(new Set());
  const currentArrayBufferRef = useRef<ArrayBuffer | null>(null);
  const preloadingRef = useRef<boolean>(false);

  // Function to render a specific page on-demand
  const renderPage = async (pageIndex: number): Promise<string | null> => {
    if (!pdfDocRef.current || renderingPagesRef.current.has(pageIndex)) {
      return null;
    }

    const pageNum = pageIndex + 1;
    if (pageImages[pageIndex]) {
      return pageImages[pageIndex]; // Already rendered
    }

    renderingPagesRef.current.add(pageIndex);

    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL();

        // Update the pageImages array
        setPageImages(prev => {
          const newImages = [...prev];
          newImages[pageIndex] = dataUrl;
          return newImages;
        });

        renderingPagesRef.current.delete(pageIndex);
        return dataUrl;
      }
    } catch (error) {
      console.error(`Failed to render page ${pageNum}:`, error);
    }

    renderingPagesRef.current.delete(pageIndex);
    return null;
  };

  // Progressive preloading function
  const startProgressivePreload = async () => {
    if (!pdfDocRef.current || preloadingRef.current || numPages === 0) return;
    
    preloadingRef.current = true;
    
    // Start with first few pages for immediate viewing
    const priorityPages = [0, 1, 2, 3, 4]; // First 5 pages
    
    // Render priority pages first
    for (const pageIndex of priorityPages) {
      if (pageIndex < numPages && !pageImages[pageIndex]) {
        await renderPage(pageIndex);
        // Small delay to allow UI to update
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // Then render remaining pages in background
    for (let pageIndex = 5; pageIndex < numPages; pageIndex++) {
      if (!pageImages[pageIndex]) {
        await renderPage(pageIndex);
        // Longer delay for background loading to not block UI
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    preloadingRef.current = false;
  };

  // Initialize current page when PDF loads
  useEffect(() => {
    if (numPages > 0 && !currentPage) {
      setCurrentPage(1);
    }
  }, [numPages, currentPage]);

  // Scroll to the current page when manually navigated
  useEffect(() => {
    if (currentPage && pageRefs.current[currentPage - 1] && isManualNavigationRef.current) {
      const el = pageRefs.current[currentPage - 1];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      
      // Reset manual navigation flag after a delay
      const timeout = setTimeout(() => {
        isManualNavigationRef.current = false;
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [currentPage, pageImages]);

  // Detect visible page on scroll (only update display, don't trigger navigation)
  const handleScroll = () => {
    if (isManualNavigationRef.current) return;
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea || !pageRefs.current.length) return;

    const areaRect = scrollArea.getBoundingClientRect();
    const viewportCenter = areaRect.top + areaRect.height / 2;
    let closestIdx = 0;
    let minDist = Infinity;

    pageRefs.current.forEach((img, idx) => {
      if (img) {
        const imgRect = img.getBoundingClientRect();
        const imgCenter = imgRect.top + imgRect.height / 2;
        const dist = Math.abs(imgCenter - viewportCenter);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = idx;
        }
      }
    });

    // Only update if the page actually changed and we're not in manual navigation
    if (currentPage !== closestIdx + 1) {
      setCurrentPage(closestIdx + 1);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadPdfInfo() {
      if (!effectiveFile) {
        setNumPages(0);
        setPageImages([]);
        return;
      }
      setLoading(true);
      try {
        let pdfData;
        
        // For preview files, use ArrayBuffer directly to avoid blob URL issues
        if (previewFile && effectiveFile.file === previewFile) {
          const arrayBuffer = await previewFile.arrayBuffer();
          pdfData = { data: arrayBuffer };
        }
        // Handle special IndexedDB URLs for large files
        else if (effectiveFile.url?.startsWith('indexeddb:')) {
          const fileId = effectiveFile.url.replace('indexeddb:', '');

          // Get data directly from IndexedDB
          const arrayBuffer = await fileStorage.getFileData(fileId);
          if (!arrayBuffer) {
            throw new Error('File not found in IndexedDB - may have been purged by browser');
          }

          // Store reference for cleanup
          currentArrayBufferRef.current = arrayBuffer;
          pdfData = { data: arrayBuffer };
        } else if (effectiveFile.url) {
          // Standard blob URL or regular URL
          pdfData = effectiveFile.url;
        } else {
          throw new Error('No valid PDF source available');
        }

        const pdf = await getDocument(pdfData).promise;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        if (!cancelled) {
          setPageImages(new Array(pdf.numPages).fill(null));
          // Start progressive preloading after a short delay
          setTimeout(() => startProgressivePreload(), 100);
        }
      } catch (error) {
        if (!cancelled) {
          setPageImages([]);
          setNumPages(0);
        }
      }
      if (!cancelled) setLoading(false);
    }
    loadPdfInfo();
    return () => {
      cancelled = true;
      // Stop any ongoing preloading
      preloadingRef.current = false;
      // Cleanup ArrayBuffer reference to help garbage collection
      currentArrayBufferRef.current = null;
    };
  }, [effectiveFile, previewFile]);

  useEffect(() => {
    const viewport = scrollAreaRef.current;
    if (!viewport) return;
    const handler = () => {
      handleScroll();
    };
    viewport.addEventListener("scroll", handler);
    return () => viewport.removeEventListener("scroll", handler);
  }, [pageImages]);

  return (
    <Box style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Close Button - Only show in preview mode */}
      {onClose && previewFile && (
        <ActionIcon
          variant="filled"
          color="gray"
          size="lg"
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            zIndex: 1000,
            borderRadius: '50%',
          }}
          onClick={onClose}
        >
          <CloseIcon />
        </ActionIcon>
      )}
      
      {!effectiveFile ? (
        <Center style={{ flex: 1 }}>
          <Stack align="center">
            <Text c="dimmed">{t("viewer.noPdfLoaded", "No PDF loaded. Click to upload a PDF.")}</Text>
            <Button
              component="label"
              variant="outline"
              color="blue"
            >
              {t("viewer.choosePdf", "Choose PDF")}
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.type === "application/pdf") {
                    addFiles([file]);
                  }
                }}
              />
            </Button>
          </Stack>
        </Center>
      ) : loading ? (
        <div style={{ flex: 1, padding: '1rem' }}>
          <SkeletonLoader type="viewer" />
        </div>
      ) : (
        <ScrollArea
          style={{ flex: 1, position: "relative"}}
          viewportRef={scrollAreaRef}
        >
          <Stack gap="xl" align="center" >
            {numPages === 0 && (
              <Text color="dimmed">{t("viewer.noPagesToDisplay", "No pages to display.")}</Text>
            )}
            {dualPage
              ? Array.from({ length: Math.ceil(numPages / 2) }).map((_, i) => (
                  <Group key={i} gap="md" align="flex-start" style={{ width: "100%", justifyContent: "center" }}>
                    <LazyPageImage
                      pageIndex={i * 2}
                      zoom={zoom}
                      theme={theme}
                      isFirst={i === 0}
                      renderPage={renderPage}
                      pageImages={pageImages}
                      setPageRef={(index, ref) => { pageRefs.current[index] = ref; }}
                    />
                    {i * 2 + 1 < numPages && (
                      <LazyPageImage
                        pageIndex={i * 2 + 1}
                        zoom={zoom}
                        theme={theme}
                        isFirst={i === 0}
                        renderPage={renderPage}
                        pageImages={pageImages}
                        setPageRef={(index, ref) => { pageRefs.current[index] = ref; }}
                      />
                    )}
                  </Group>
                ))
              : Array.from({ length: numPages }).map((_, idx) => (
                  <LazyPageImage
                    key={idx}
                    pageIndex={idx}
                    zoom={zoom}
                    theme={theme}
                    isFirst={idx === 0}
                    renderPage={renderPage}
                    pageImages={pageImages}
                    setPageRef={(index, ref) => { pageRefs.current[index] = ref; }}
                  />
                ))}
          </Stack>
          {/* Navigation bar overlays the scroll area */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 50,
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none",
              background: "transparent",
            }}
          >
            <Paper
              radius="xl xl 0 0"
              shadow="sm"
              p={12}
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
                minWidth: 420,
                maxWidth: 700,
                flexWrap: "wrap",
              }}
            >
              <Button
                variant="subtle"
                color="blue"
                size="md"
                px={8}
                radius="xl"
                onClick={() => {
                  isManualNavigationRef.current = true;
                  setCurrentPage(1);
                }}
                disabled={currentPage === 1}
                style={{ minWidth: 36 }}
              >
                <FirstPageIcon fontSize="small" />
              </Button>
              <Button
                variant="subtle"
                color="blue"
                size="md"
                px={8}
                radius="xl"
                onClick={() => {
                  isManualNavigationRef.current = true;
                  setCurrentPage(Math.max(1, (currentPage || 1) - 1));
                }}
                disabled={currentPage === 1}
                style={{ minWidth: 36 }}
              >
                <ArrowBackIosNewIcon fontSize="small" />
              </Button>
              <NumberInput
                value={currentPage || 1}
                onChange={value => {
                  const page = Number(value);
                  if (!isNaN(page) && page >= 1 && page <= numPages) {
                    isManualNavigationRef.current = true;
                    setCurrentPage(page);
                  }
                }}
                min={1}
                max={numPages}
                hideControls
                styles={{
                  input: { width: 48, textAlign: "center", fontWeight: 500, fontSize: 16},
                }}
              />
              <span style={{ fontWeight: 500, fontSize: 16 }}>
                / {numPages}
              </span>
              <Button
                variant="subtle"
                color="blue"
                size="md"
                px={8}
                radius="xl"
                onClick={() => {
                  isManualNavigationRef.current = true;
                  setCurrentPage(Math.min(numPages, (currentPage || 1) + 1));
                }}
                disabled={currentPage === numPages}
                style={{ minWidth: 36 }}
              >
                <ArrowForwardIosIcon fontSize="small" />
              </Button>
              <Button
                variant="subtle"
                color="blue"
                size="md"
                px={8}
                radius="xl"
                onClick={() => {
                  isManualNavigationRef.current = true;
                  setCurrentPage(numPages);
                }}
                disabled={currentPage === numPages}
                style={{ minWidth: 36 }}
              >
                <LastPageIcon fontSize="small" />
              </Button>
              <Button
                variant={dualPage ? "filled" : "light"}
                color="blue"
                size="md"
                radius="xl"
                onClick={() => setDualPage(v => !v)}
                style={{ minWidth: 36 }}
                title={dualPage ? t("viewer.singlePageView", "Single Page View") : t("viewer.dualPageView", "Dual Page View")}
              >
                {dualPage ? <DescriptionIcon fontSize="small" /> : <ViewWeekIcon fontSize="small" />}
              </Button>
              <Group gap={4} align="center" style={{ marginLeft: 16 }}>
                <Button
                  variant="subtle"
                  color="blue"
                  size="md"
                  radius="xl"
                  onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}
                  style={{ minWidth: 32, padding: 0 }}
                  title={t("viewer.zoomOut", "Zoom out")}
                >−</Button>
                <span style={{ minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
                <Button
                  variant="subtle"
                  color="blue"
                  size="md"
                  radius="xl"
                  onClick={() => setZoom(z => Math.min(5, z + 0.1))}
                  style={{ minWidth: 32, padding: 0 }}
                  title={t("viewer.zoomIn", "Zoom in")}
                >+</Button>
              </Group>
            </Paper>
          </div>
        </ScrollArea>
      )}

    </Box>
  );
};

export default Viewer;
