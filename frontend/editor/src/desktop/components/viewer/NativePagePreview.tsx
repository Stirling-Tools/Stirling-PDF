import { useEffect, useRef, useState } from "react";
import {
  renderNativeDocumentInfo,
  renderNativePdfPageBlob,
} from "@app/services/nativePdfRender";

/** Wide enough for a full-width viewer on a 2x display, small enough to land
 *  in tens of milliseconds per page. */
const PREVIEW_WIDTH = 1200;
/** Pages rendered ahead of the engine: enough to scroll a little. */
const PREVIEW_PAGES = 3;
/** Past this, show nothing more: the engine is the authority anyway. */
const GIVE_UP_MS = 12_000;
const POLL_MS = 120;

interface PreviewPage {
  page: number;
  url: string;
  width: number;
  height: number;
}

// Shadow of the core stub; @app alias order gives desktop builds this one.

/**
 * The first pages, rasterized natively, from the moment a file lands until the
 * engine's own page layer paints. The engine's first paint waits on a WASM
 * document open (hundreds of milliseconds on large files); the OS engine draws
 * these pages in single-digit milliseconds each, and the page geometry comes
 * from the same native source, so this strip is scrollable while the engine
 * catches up. It sits below the page layers and removes itself as soon as real
 * content covers it, revoking every blob URL it created.
 */
export function NativePagePreview({
  filePath,
}: {
  filePath?: string | null;
}) {
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const urlsRef = useRef<string[]>([]);

  const clear = () => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current = [];
    setPages([]);
  };

  useEffect(() => {
    if (!filePath) {
      clear();
      return;
    }
    let cancelled = false;
    const addPage = (page: PreviewPage) => {
      if (cancelled) {
        URL.revokeObjectURL(page.url);
        return;
      }
      setPages((previous) =>
        previous.some((existing) => existing.page === page.page)
          ? previous
          : [...previous, page].sort((a, b) => a.page - b.page),
      );
    };

    void (async () => {
      const info = await renderNativeDocumentInfo(filePath);
      const count = Math.max(
        1,
        Math.min(PREVIEW_PAGES, info?.pageCount ?? 1),
      );
      for (let page = 1; page <= count; page += 1) {
        if (cancelled) return;
        const blob = await renderNativePdfPageBlob(
          filePath,
          page,
          PREVIEW_WIDTH,
        );
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        urlsRef.current.push(url);
        const geometry = info?.pages[page - 1];
        addPage({
          page,
          url,
          width: geometry?.width ?? 0,
          height: geometry?.height ?? 0,
        });
      }
    })();

    return () => {
      cancelled = true;
      clear();
    };
    // clear is a ref/state-only helper; filePath is the input that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  useEffect(() => {
    if (pages.length === 0) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const painted = Array.from(
        document.querySelectorAll("[data-page-index]"),
      ).some(
        (page) =>
          page.querySelector('canvas, img[src^="blob:"], img[src^="data:"]') !==
          null,
      );
      if (painted || Date.now() - started > GIVE_UP_MS) {
        window.clearInterval(timer);
        clear();
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length]);

  if (pages.length === 0) return null;
  return (
    <div
      data-testid="native-page-preview"
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1rem",
        padding: "1rem 0",
        background: "var(--c-surface, #f5f5f5)",
        zIndex: 1,
      }}
    >
      {pages.map((preview) => (
        <img
          key={preview.page}
          src={preview.url}
          alt=""
          style={{
            width: `${PREVIEW_WIDTH}px`,
            maxWidth: "100%",
            aspectRatio:
              preview.width > 0 && preview.height > 0
                ? `${preview.width} / ${preview.height}`
                : undefined,
            background: "#fff",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        />
      ))}
    </div>
  );
}
