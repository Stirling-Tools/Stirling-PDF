import React, { useEffect, useState, useRef } from "react";
import { Paper, Stack, Text, ScrollArea, Loader, Center, Button, Group, NumberInput, useMantineTheme } from "@mantine/core";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { useTranslation } from "react-i18next";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import LastPageIcon from "@mui/icons-material/LastPage";
import ViewSidebarIcon from "@mui/icons-material/ViewSidebar";
import ViewWeekIcon from "@mui/icons-material/ViewWeek"; // for dual page (book)
import DescriptionIcon from "@mui/icons-material/Description"; // for single page
import { useLocalStorage } from "@mantine/hooks";
import { fileStorage } from "../services/fileStorage";

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

const LazyPageImage: React.FC<LazyPageImageProps> = ({
  pageIndex, zoom, theme, isFirst, renderPage, pageImages, setPageRef
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(pageImages[pageIndex]);
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
  pdfFile: { file: File; url: string } | null;
  setPdfFile: (file: { file: File; url: string } | null) => void;
  sidebarsVisible: boolean;
  setSidebarsVisible: (v: boolean) => void;
}

const Viewer: React.FC<ViewerProps> = ({
  pdfFile,
  setPdfFile,
  sidebarsVisible,
  setSidebarsVisible,
}) => {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const [numPages, setNumPages] = useState<number>(0);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [dualPage, setDualPage] = useState(false);
  const [zoom, setZoom] = useState(1); // 1 = 100%
  const pageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const userInitiatedRef = useRef(false);
  const suppressScrollRef = useRef(false);
  const pdfDocRef = useRef<any>(null);
  const renderingPagesRef = useRef<Set<number>>(new Set());
  const currentArrayBufferRef = useRef<ArrayBuffer | null>(null);

  // Function to render a specific page on-demand
  const renderPage = async (pageIndex: number): Promise<string | null> => {
    if (!pdfFile || !pdfDocRef.current || renderingPagesRef.current.has(pageIndex)) {
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

  // Listen for hash changes and update currentPage
  useEffect(() => {
    function handleHashChange() {
      if (window.location.hash.startsWith("#page=")) {
        const page = parseInt(window.location.hash.replace("#page=", ""), 10);
        if (!isNaN(page) && page >= 1 && page <= numPages) {
          setCurrentPage(page);
        }
      }
      userInitiatedRef.current = false;
    }
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange(); // Run on mount
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [numPages]);

  // Scroll to the current page when it changes
  useEffect(() => {
    if (currentPage && pageRefs.current[currentPage - 1]) {
      suppressScrollRef.current = true;
      const el = pageRefs.current[currentPage - 1];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });

      // Try to use scrollend if supported
      const viewport = scrollAreaRef.current;
      let timeout: NodeJS.Timeout | null = null;
      let scrollEndHandler: (() => void) | null = null;

      if (viewport && "onscrollend" in viewport) {
        scrollEndHandler = () => {
          suppressScrollRef.current = false;
          viewport.removeEventListener("scrollend", scrollEndHandler!);
        };
        viewport.addEventListener("scrollend", scrollEndHandler);
      } else {
        // Fallback for non-Chromium browsers
        timeout = setTimeout(() => {
          suppressScrollRef.current = false;
        }, 1000);
      }

      return () => {
        if (viewport && scrollEndHandler) {
          viewport.removeEventListener("scrollend", scrollEndHandler);
        }
        if (timeout) clearTimeout(timeout);
      };
    }
  }, [currentPage, pageImages]);

  // Detect visible page on scroll and update hash
  const handleScroll = () => {
    if (suppressScrollRef.current) return;
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea || !pageRefs.current.length) return;

    const areaRect = scrollArea.getBoundingClientRect();
    let closestIdx = 0;
    let minDist = Infinity;

    pageRefs.current.forEach((img, idx) => {
      if (img) {
        const imgRect = img.getBoundingClientRect();
        const dist = Math.abs(imgRect.top - areaRect.top);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = idx;
        }
      }
    });

    if (currentPage !== closestIdx + 1) {
      setCurrentPage(closestIdx + 1);
      if (window.location.hash !== `#page=${closestIdx + 1}`) {
        window.location.hash = `#page=${closestIdx + 1}`;
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadPdfInfo() {
      if (!pdfFile || !pdfFile.url) {
        setNumPages(0);
        setPageImages([]);
        return;
      }
      setLoading(true);
      try {
        let pdfUrl = pdfFile.url;

        // Handle special IndexedDB URLs for large files
        if (pdfFile.url.startsWith('indexeddb:')) {
          const fileId = pdfFile.url.replace('indexeddb:', '');
          console.log('Loading large file from IndexedDB:', fileId);

          // Get data directly from IndexedDB
          const arrayBuffer = await fileStorage.getFileData(fileId);
          if (!arrayBuffer) {
            throw new Error('File not found in IndexedDB - may have been purged by browser');
          }

          // Store reference for cleanup
          currentArrayBufferRef.current = arrayBuffer;

          // Use ArrayBuffer directly instead of creating blob URL
          const pdf = await getDocument({ data: arrayBuffer }).promise;
          pdfDocRef.current = pdf;
          setNumPages(pdf.numPages);
          if (!cancelled) setPageImages(new Array(pdf.numPages).fill(null));
        } else {
          // Standard blob URL or regular URL
          const pdf = await getDocument(pdfUrl).promise;
          pdfDocRef.current = pdf;
          setNumPages(pdf.numPages);
          if (!cancelled) setPageImages(new Array(pdf.numPages).fill(null));
        }
      } catch (error) {
        console.error('Failed to load PDF:', error);
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
      // Cleanup ArrayBuffer reference to help garbage collection
      currentArrayBufferRef.current = null;
    };
  }, [pdfFile]);

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
    <>
      {!pdfFile ? (
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
                    const fileUrl = URL.createObjectURL(file);
                    setPdfFile({ file, url: fileUrl });
                  }
                }}
              />
            </Button>
          </Stack>
        </Center>
      ) : loading ? (
        <Center style={{ flex: 1 }}>
          <Loader size="lg" />
        </Center>
      ) : (
        <ScrollArea
          style={{ flex: 1, height: "100vh", position: "relative"}}
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
                  window.location.hash = `#page=1`;
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
                  window.location.hash = `#page=${Math.max(1, (currentPage || 1) - 1)}`;
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
                    window.location.hash = `#page=${page}`;
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
                  window.location.hash = `#page=${Math.min(numPages, (currentPage || 1) + 1)}`;
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
                  window.location.hash = `#page=${numPages}`;
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

    </>
  );
};

export default Viewer;
