import React, { useEffect, useState, useRef } from "react";
import { Paper, Stack, Text, ScrollArea, Loader, Center, Button, Group, NumberInput, useMantineTheme } from "@mantine/core";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import LastPageIcon from "@mui/icons-material/LastPage";
import ViewSidebarIcon from "@mui/icons-material/ViewSidebar";
import ViewWeekIcon from "@mui/icons-material/ViewWeek"; // for dual page (book)
import DescriptionIcon from "@mui/icons-material/Description"; // for single page
import { useLocalStorage } from "@mantine/hooks";

GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

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
    async function renderPages() {
      if (!pdfFile || !pdfFile.url) {
        setNumPages(0);
        setPageImages([]);
        return;
      }
      setLoading(true);
      try {
        const pdf = await getDocument(pdfFile.url).promise;
        setNumPages(pdf.numPages);
        const images: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            images.push(canvas.toDataURL());
          }
        }
        if (!cancelled) setPageImages(images);
      } catch {
        if (!cancelled) setPageImages([]);
      }
      if (!cancelled) setLoading(false);
    }
    renderPages();
    return () => { cancelled = true; };
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
    <Paper
      shadow="xs"
      radius="md"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {!pdfFile ? (
        <Center style={{ flex: 1 }}>
          <Stack align="center">
            <Text c="dimmed">No PDF loaded. Click to upload a PDF.</Text>
            <Button
              component="label"
              variant="outline"
              color="blue"
            >
              Choose PDF
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
          style={{ flex: 1, height: "100%", position: "relative"}}
          viewportRef={scrollAreaRef}
        >
          <Stack gap="xl" align="center" >
            {pageImages.length === 0 && (
              <Text color="dimmed">No pages to display.</Text>
            )}
            {dualPage
              ? Array.from({ length: Math.ceil(pageImages.length / 2) }).map((_, i) => (
                  <Group key={i} gap="md" align="flex-start" style={{ width: "100%", justifyContent: "center" }}>
                    <img
                      ref={el => { pageRefs.current[i * 2] = el; }}
                      src={pageImages[i * 2]}
                      alt={`Page ${i * 2 + 1}`}
                      style={{
                        width: `${100 * zoom}%`,
                        maxWidth: 700 * zoom,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                        borderRadius: 8,
                        marginTop: i === 0 ? theme.spacing.xl : 0, // <-- add gap to first row
                      }}
                    />
                    {pageImages[i * 2 + 1] && (
                      <img
                        ref={el => { pageRefs.current[i * 2 + 1] = el; }}
                        src={pageImages[i * 2 + 1]}
                        alt={`Page ${i * 2 + 2}`}
                        style={{
                          width: `${100 * zoom}%`,
                          maxWidth: 700 * zoom,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                          borderRadius: 8,
                          marginTop: i === 0 ? theme.spacing.xl : 0, // <-- add gap to first row
                        }}
                      />
                    )}
                  </Group>
                ))
              : pageImages.map((img, idx) => (
                  <img
                    key={idx}
                    ref={el => { pageRefs.current[idx] = el; }}
                    src={img}
                    alt={`Page ${idx + 1}`}
                    style={{
                      width: `${100 * zoom}%`,
                      maxWidth: 700 * zoom,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      borderRadius: 8,
                      marginTop: idx === 0 ? theme.spacing.xl : 0, // <-- add gap to first page
                    }}
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
                title={dualPage ? "Single Page View" : "Dual Page View"}
              >
                {dualPage ? <DescriptionIcon fontSize="small" /> : <ViewWeekIcon fontSize="small" />}
              </Button>
              <Button
                variant="subtle"
                color="blue"
                size="md"
                radius="xl"
                onClick={() => setSidebarsVisible(!sidebarsVisible)}
                style={{ minWidth: 36 }}
                title={sidebarsVisible ? "Hide Sidebars" : "Show Sidebars"}
              >
                <ViewSidebarIcon
                  fontSize="small"
                  style={{
                    transform: sidebarsVisible ? "none" : "scaleX(-1)",
                    transition: "transform 0.2s"
                  }}
                />
              </Button>
              <Group gap={4} align="center" style={{ marginLeft: 16 }}>
                <Button
                  variant="subtle"
                  color="blue"
                  size="md"
                  radius="xl"
                  onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}
                  style={{ minWidth: 32, padding: 0 }}
                  title="Zoom out"
                >−</Button>
                <span style={{ minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
                <Button
                  variant="subtle"
                  color="blue"
                  size="md"
                  radius="xl"
                  onClick={() => setZoom(z => Math.min(5, z + 0.1))}
                  style={{ minWidth: 32, padding: 0 }}
                  title="Zoom in"
                >+</Button>
              </Group>
            </Paper>
          </div>
        </ScrollArea>
      )}

    </Paper>
  );
};

export default Viewer;
