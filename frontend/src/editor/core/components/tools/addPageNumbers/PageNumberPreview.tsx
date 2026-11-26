import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { VisuallyHidden } from "@mantine/core";
import {
  AddPageNumbersParameters,
  pageNumberText,
} from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";
import { pdfWorkerManager } from "@editor/services/pdfWorkerManager";
import { useThumbnailGeneration } from "@editor/hooks/useThumbnailGeneration";
import styles from "@editor/components/tools/addPageNumbers/PageNumberPreview.module.css";
import { PrivateContent } from "@editor/components/shared/PrivateContent";
import { Button } from "@editor/ui/Button";
import {
  fileNameWithoutExtension,
  formatPageNumberLabel,
  getPageNumberLabelStyle,
  getPageNumberPlacement,
} from "@editor/components/tools/addPageNumbers/pageNumberLabel";

// Simple utilities for page numbers (adapted from stamp)
const A4_ASPECT_RATIO = 0.707;
const A4_WIDTH_PTS = 595.28;
// A true-scale 12pt number is about 5px in the panel, too small to read.
const MIN_LABEL_PX = 9;

const getFirstSelectedPage = (input: string): number => {
  if (!input) return 1;
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (/^\d+\s*-\s*\d+$/.test(part)) {
      const low = parseInt(part.split("-")[0].trim(), 10);
      if (Number.isFinite(low) && low > 0) return low;
    }
    const n = parseInt(part, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
};

type Props = {
  parameters: AddPageNumbersParameters;
  onParameterChange: <K extends keyof AddPageNumbersParameters>(
    key: K,
    value: AddPageNumbersParameters[K],
  ) => void;
  file?: File | null;
  showQuickGrid?: boolean;
};

export default function PageNumberPreview({
  parameters,
  onParameterChange,
  file,
  showQuickGrid,
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  }>({
    width: 0,
    height: 0,
  });
  const [pageSize, setPageSize] = useState<{
    widthPts: number;
    heightPts: number;
  } | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageThumbnail, setPageThumbnail] = useState<string | null>(null);
  const { requestThumbnail } = useThumbnailGeneration();
  const [hoverTile, setHoverTile] = useState<number | null>(null);

  // Observe container size for responsive positioning
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const resize = () => {
      const aspect = pageSize
        ? pageSize.widthPts / pageSize.heightPts
        : A4_ASPECT_RATIO;
      setContainerSize({
        width: node.clientWidth,
        height: node.clientWidth / aspect,
      });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(node);
    return () => ro.disconnect();
  }, [pageSize]);

  // Load first PDF page size in points for accurate scaling
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!file || file.type !== "application/pdf") {
        setPageSize(null);
        setPageCount(null);
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfWorkerManager.createDocument(buffer, {
          disableAutoFetch: true,
          disableStream: true,
        });
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        if (!cancelled) {
          setPageSize({ widthPts: viewport.width, heightPts: viewport.height });
          setPageCount(pdf.numPages);
        }
        pdfWorkerManager.destroyDocument(pdf);
      } catch {
        if (!cancelled) {
          setPageSize(null);
          setPageCount(null);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Load first-page thumbnail for background preview
  useEffect(() => {
    let isActive = true;
    const loadThumb = async () => {
      if (!file || file.type !== "application/pdf") {
        setPageThumbnail(null);
        return;
      }
      try {
        const pageNumber = Math.max(
          1,
          getFirstSelectedPage(parameters.pagesToNumber || "1"),
        );
        const pageId = `${file.name}:${file.size}:${file.lastModified}:page:${pageNumber}`;
        const thumb = await requestThumbnail(pageId, file, pageNumber);
        if (isActive) setPageThumbnail(thumb || null);
      } catch {
        if (isActive) setPageThumbnail(null);
      }
    };
    loadThumb();
    return () => {
      isActive = false;
    };
  }, [file, parameters.pagesToNumber, requestThumbnail]);

  const containerStyle = useMemo(
    () => ({
      position: "relative" as const,
      width: "100%",
      aspectRatio: `${(pageSize?.widthPts ?? A4_WIDTH_PTS) / (pageSize?.heightPts ?? 841.89)} / 1`,
      backgroundColor: pageThumbnail ? "white" : "rgba(255,255,255,0.03)",
      border: "1px solid var(--c-border, #333)",
      overflow: "hidden" as const,
    }),
    [pageSize, pageThumbnail],
  );

  // The first page the tool numbers gets the starting number. A hovered tile
  // previews its position before it is picked.
  const label = formatPageNumberLabel(pageNumberText(parameters), {
    n: parameters.startingNumber,
    zeroPad: parameters.zeroPad,
    total: pageCount ?? undefined,
    filename: file ? fileNameWithoutExtension(file.name) : undefined,
  });
  const labelStyle = getPageNumberLabelStyle(
    getPageNumberPlacement(
      hoverTile ?? parameters.position,
      parameters.customMargin,
    ),
    parameters.fontType,
    Math.max(
      MIN_LABEL_PX,
      (parameters.fontSize * containerSize.width) /
        (pageSize?.widthPts ?? A4_WIDTH_PTS),
    ),
  );

  return (
    <div>
      <div className={styles.previewHeader}>
        <div className={styles.divider} />
        <div className={styles.previewLabel}>
          {t("addPageNumbers.preview", "Preview Page Numbers")}
        </div>
      </div>
      <div
        ref={containerRef}
        data-testid="page-number-preview-page"
        className={`${styles.container} ${styles.containerBorder} ${pageThumbnail ? styles.containerWithThumbnail : styles.containerWithoutThumbnail}`}
        style={containerStyle}
      >
        {pageThumbnail && (
          <PrivateContent>
            <img
              src={pageThumbnail}
              alt={t("addPageNumbers.pagePreviewAlt", "Page preview")}
              className={styles.pageThumbnail}
              draggable={false}
            />
          </PrivateContent>
        )}

        {/* Quick position overlay grid - EXACT copy from stamp */}
        {showQuickGrid && (
          <div className={styles.quickGrid}>
            {Array.from({ length: 9 }).map((_, i) => {
              const idx = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
              const selected = parameters.position === idx;
              return (
                <Button
                  variant="tertiary"
                  key={idx}
                  className={`${styles.gridTile} ${selected || hoverTile === idx ? styles.gridTileSelected : ""} ${hoverTile === idx ? styles.gridTileHovered : ""}`}
                  onClick={() => onParameterChange("position", idx)}
                  onMouseEnter={() => setHoverTile(idx)}
                  onMouseLeave={() => setHoverTile(null)}
                  // The tertiary button's own hover tint is near-black in dark mode.
                  style={
                    {
                      "--button-hover": "var(--tile-highlight)",
                    } as CSSProperties
                  }
                >
                  <VisuallyHidden>{idx}</VisuallyHidden>
                </Button>
              );
            })}
          </div>
        )}

        <PrivateContent>
          <span
            className={`${styles.pageNumberLabel} ${pageThumbnail ? styles.pageNumberLabelOnPage : ""}`}
            data-testid="page-number-preview-label"
            style={labelStyle}
          >
            {label}
          </span>
        </PrivateContent>
      </div>
      <div className={styles.previewDisclaimer}>
        {t(
          "addPageNumbers.previewDisclaimer",
          "Preview is approximate. Final output may vary due to PDF font metrics.",
        )}
      </div>
    </div>
  );
}
