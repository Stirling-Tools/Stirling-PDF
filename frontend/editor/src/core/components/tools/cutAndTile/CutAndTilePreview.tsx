import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useViewer } from "@app/contexts/ViewerContext";
import styles from "@app/components/tools/cutAndTile/CutAndTilePreview.module.css";
import {
  gridDivisions,
  posterDivisions,
  type CutAndTileParameters,
} from "@app/hooks/tools/cutAndTile/useCutAndTileParameters";

interface CutAndTilePreviewProps {
  parameters: CutAndTileParameters;
  /** Page 1 raster the file already carries, used when a render is unavailable. */
  thumbnailUrl?: string | null;
}

/** Rendered wider than the slot so the preview stays sharp on a 2x display. */
const RENDER_WIDTH = 320;

/** Numbers stop being legible past this many cells; the grid lines still show. */
const MAX_LABELLED_CELLS = 24;

/** Small LRU of decoded page rasters; two files' worth is all a tool session needs. */
const CACHE_LIMIT = 4;
const rasterCache = new Map<string, ImageBitmap>();
const cachedSource = new Map<string, PreviewSource>();

function remember(key: string, bitmap: ImageBitmap): void {
  const existing = rasterCache.get(key);
  if (existing) existing.close();
  rasterCache.set(key, bitmap);
  while (rasterCache.size > CACHE_LIMIT) {
    const oldest = rasterCache.keys().next().value;
    if (oldest === undefined) break;
    rasterCache.get(oldest)?.close();
    rasterCache.delete(oldest);
    cachedSource.delete(oldest);
  }
}

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

export interface Cell {
  column: number;
  row: number;
  number: number;
}

/**
 * Numbers the cells in the order the endpoint writes them, which is not reading
 * order: the section endpoint walks a column from top to bottom before moving
 * to the next one. Verified against split-pdf-by-sections output.
 */
export function gridCells(rows: number, columns: number): Cell[] {
  const cells: Cell[] = [];
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      cells.push({ column, row, number: column * rows + row + 1 });
    }
  }
  return cells;
}

/** Poster tiles run left to right, top to bottom, one row of the page at a time. */
export function posterCells(
  rows: number,
  columns: number,
  rightToLeft: boolean,
): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        column: rightToLeft ? columns - 1 - column : column,
        row,
        number: row * columns + column + 1,
      });
    }
  }
  return cells;
}

type PreviewSource = "render" | "thumbnail" | "none";

interface PreviewRaster {
  bitmap: ImageBitmap;
  source: PreviewSource;
}

async function loadBitmap(
  renderPreview: (() => Promise<Blob>) | null,
  thumbnailUrl: string | null,
): Promise<PreviewRaster | null> {
  try {
    if (renderPreview) {
      return { bitmap: await createImageBitmap(await renderPreview()), source: "render" };
    }
    if (thumbnailUrl) {
      const blob = await (await fetch(thumbnailUrl)).blob();
      return { bitmap: await createImageBitmap(blob), source: "thumbnail" };
    }
    return null;
  } catch {
    return null;
  }
}

export function CutAndTilePreview({
  parameters,
  thumbnailUrl,
}: CutAndTilePreviewProps): ReactNode {
  const { t } = useTranslation();
  const viewer = useViewer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState<PreviewRaster | null>(null);
  const raster = preview?.bitmap ?? null;

  const poster = parameters.mode === "poster";
  const divisions = poster
    ? posterDivisions(parameters)
    : gridDivisions(parameters);

  const cacheKey = `${thumbnailUrl ?? ""}|${RENDER_WIDTH}`;
  // The thumbnail bridge registers after the document loads, which can be after
  // this component mounts. Read it at call time and retry briefly rather than
  // depending on a context update: the file thumbnail paints immediately, and
  // the sharper PDFium render replaces it when the bridge appears.
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;

  useEffect(() => {
    const cached = rasterCache.get(cacheKey);
    if (cached) {
      setPreview({
        bitmap: cached,
        source: cachedSource.get(cacheKey) ?? "render",
      });
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let drawn: PreviewSource | null = null;
    let attempts = 0;

    const attempt = async () => {
      const api = viewerRef.current?.getThumbnailAPI?.();
      const render = api?.renderPreview;

      if (render) {
        const rendered = await loadBitmap(
          () => render(0, RENDER_WIDTH).toPromise(),
          null,
        );
        if (rendered) {
          remember(cacheKey, rendered.bitmap);
          cachedSource.set(cacheKey, rendered.source);
          drawn = rendered.source;
          if (!cancelled) setPreview(rendered);
          return;
        }
      }

      if (!drawn && thumbnailUrl) {
        const fallback = await loadBitmap(null, thumbnailUrl);
        if (fallback) {
          drawn = fallback.source;
          if (!cancelled) setPreview(fallback);
        }
      }

      if (!cancelled && drawn !== "render" && attempts < 60) {
        attempts += 1;
        timer = window.setTimeout(() => void attempt(), 50);
      }
    };

    void attempt();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [cacheKey, thumbnailUrl]);

  // One blit per raster. Changing rows, columns or mode never touches the
  // canvas: the grid is a CSS overlay, so a parameter change costs no pixels.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !raster) return;
    const cssWidth = canvas.clientWidth || 240;
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(cssWidth * scale);
    canvas.height = Math.round(
      (cssWidth * raster.height * scale) / raster.width,
    );
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(raster, 0, 0, canvas.width, canvas.height);
  }, [raster]);

  if (!divisions) return null;

  const { rows, columns } = divisions;
  const cells = poster
    ? posterCells(rows, columns, parameters.rightToLeft)
    : gridCells(rows, columns);
  const labelled = cells.length <= MAX_LABELLED_CELLS;

  const caption = poster
    ? t(
        "cutAndTile.preview.posterCaption",
        "Tiles run left to right; each is scaled to fit {{size}}, so margins can be blank.",
        { size: parameters.pageSize || "A4" },
      )
    : t(
        "cutAndTile.preview.gridCaption",
        "Pieces are numbered down each column, starting top left.",
      );

  const aspect = raster ? raster.width / raster.height : 210 / 297;
  const frameStyle: CSSVars = {
    "--preview-aspect": aspect,
    "--preview-columns": columns,
    "--preview-rows": rows,
  };

  return (
    <figure
      className={styles.figure}
      data-testid="cut-and-tile-preview"
      data-state={raster ? "page" : "placeholder"}
      data-source={preview?.source ?? "none"}
    >
      <div className={styles.frame}>
        <div className={styles.sheet} style={frameStyle}>
          <canvas
            ref={canvasRef}
            className={styles.page}
            aria-hidden="true"
            data-testid="cut-and-tile-preview-canvas"
          />
          <div className={styles.grid} aria-hidden="true" />
          {labelled && (
            <div className={styles.numbers} aria-hidden="true">
              {cells.map((cell) => (
                <span
                  key={`${cell.column}-${cell.row}`}
                  className={styles.number}
                  style={{
                    left: `${((cell.column + 0.5) / columns) * 100}%`,
                    top: `${((cell.row + 0.5) / rows) * 100}%`,
                  }}
                >
                  {cell.number}
                </span>
              ))}
            </div>
          )}
          <span className={styles.srOnly} role="img" aria-label={caption} />
        </div>
      </div>
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  );
}

export default CutAndTilePreview;
