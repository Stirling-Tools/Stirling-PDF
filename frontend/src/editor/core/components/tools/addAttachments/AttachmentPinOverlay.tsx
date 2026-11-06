import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { Button } from "@editor/ui/Button";
import "@editor/components/tools/addAttachments/AttachmentPinOverlay.css";

export interface AttachmentPinMarker {
  id: string;
  name: string;
  /** Name the current document stores, when the pin can already be opened. */
  openName?: string;
  pageIndex: number;
  x: number;
  y: number;
}

interface AttachmentPinOverlayProps {
  /** Row waiting for a page click, or null when only existing pins show. */
  target: { id: string; name: string } | null;
  pins: AttachmentPinMarker[];
  onPlace: (pageIndex: number, x: number, y: number) => void;
  onOpenPin?: (filename: string) => void;
  onCancel: () => void;
}

interface PageRect {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GhostPinState {
  pageIndex: number;
  xPercent: number;
  yPercent: number;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Nearest scrollable ancestor that owns the viewer's page geometry. */
function findScrollContainer(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Clip fallback when the viewer is not mounted inside a scroll container. */
function fullViewport(): ViewportRect {
  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function sameViewport(a: ViewportRect, b: ViewportRect): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

function samePageRects(a: PageRect[], b: PageRect[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (rect, index) =>
        rect.pageIndex === b[index].pageIndex &&
        rect.left === b[index].left &&
        rect.top === b[index].top &&
        rect.width === b[index].width &&
        rect.height === b[index].height,
    )
  );
}

/**
 * Designed Pin Marker rendering an elevated teardrop pin with central icon.
 */
export function AttachmentPinGraphic() {
  return (
    <div className="attachment-pin-overlay__marker-pin" aria-hidden="true">
      <div className="attachment-pin-overlay__marker-base">
        <Icon name="pin-marker" size={26} filled />
      </div>
      <div className="attachment-pin-overlay__marker-icon">
        <Icon name="paperclip" size={11} strokeWidth={2.4} />
      </div>
    </div>
  );
}

/**
 * Fixed-position pin layer over the viewer's page elements.
 */
export function AttachmentPinOverlay({
  target,
  pins,
  onPlace,
  onOpenPin,
  onCancel,
}: AttachmentPinOverlayProps) {
  const { t } = useTranslation();
  const [pageRects, setPageRects] = useState<PageRect[]>([]);
  const [viewport, setViewport] = useState<ViewportRect>(fullViewport);
  const [ghostPin, setGhostPin] = useState<GhostPinState | null>(null);
  const frameRef = useRef<number | null>(null);

  /** Re-read page and viewer geometry after scroll, zoom, or layout changes. */
  const measure = useCallback(() => {
    const pages = Array.from(
      document.querySelectorAll<HTMLElement>("[data-page-index]"),
    );
    const scroller = pages[0] ? findScrollContainer(pages[0]) : null;
    const scrollerRect = scroller?.getBoundingClientRect();
    const dock = document.querySelector<HTMLElement>(
      ".pdf-viewer-toolbar-dock",
    );
    const dockRect = dock?.getBoundingClientRect();
    const dockTop =
      dockRect &&
      scrollerRect &&
      dockRect.top > scrollerRect.top &&
      dockRect.top < scrollerRect.bottom
        ? dockRect.top
        : null;
    const workbenchBar = document.querySelector<HTMLElement>(".workbench-bar");
    const workbenchBottom = workbenchBar?.getBoundingClientRect().bottom ?? 0;

    let nextViewport: ViewportRect;
    if (scrollerRect) {
      const left = Math.max(0, scrollerRect.left);
      const top = Math.max(0, scrollerRect.top, workbenchBottom);
      const right = Math.min(window.innerWidth, scrollerRect.right);
      const bottom = Math.min(
        window.innerHeight,
        scrollerRect.bottom,
        dockTop ?? scrollerRect.bottom,
      );
      nextViewport = {
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
    } else {
      nextViewport = fullViewport();
    }
    setViewport((previous) =>
      sameViewport(previous, nextViewport) ? previous : nextViewport,
    );

    const next: PageRect[] = [];
    pages.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const pageIndex = Number(element.dataset.pageIndex);
      if (!Number.isFinite(pageIndex) || rect.width <= 0 || rect.height <= 0) {
        return;
      }
      next.push({
        pageIndex,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    });
    setPageRects((previous) =>
      samePageRects(previous, next) ? previous : next,
    );
  }, []);

  useEffect(() => {
    if (!target && pins.length === 0) {
      setPageRects([]);
      return;
    }

    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measure();
      });
    };

    measure();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "style",
        "data-page-width",
        "data-page-height",
        "data-page-rotation",
      ],
    });
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [measure, pins.length, target]);

  useEffect(() => {
    if (!target) {
      setGhostPin(null);
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, target]);

  if (!target && pins.length === 0) {
    return null;
  }

  const renderedPageRects = target
    ? pageRects
    : pageRects.filter((rect) =>
        pins.some((pin) => pin.pageIndex === rect.pageIndex),
      );

  const handlePageClick =
    (rect: PageRect) => (event: MouseEvent<HTMLDivElement>) => {
      if (!target) return;
      onPlace(
        rect.pageIndex,
        clampUnit((event.clientX - rect.left) / rect.width),
        clampUnit((event.clientY - rect.top) / rect.height),
      );
    };

  const handlePageMouseMove =
    (rect: PageRect) => (event: MouseEvent<HTMLDivElement>) => {
      if (!target) return;
      setGhostPin({
        pageIndex: rect.pageIndex,
        xPercent: clampUnit((event.clientX - rect.left) / rect.width),
        yPercent: clampUnit((event.clientY - rect.top) / rect.height),
      });
    };

  const handlePageMouseLeave = () => {
    setGhostPin(null);
  };

  return createPortal(
    <div
      className={`attachment-pin-overlay${
        target ? " attachment-pin-overlay--placing" : ""
      }`}
      data-testid="attachment-pin-overlay"
      onClick={target ? onCancel : undefined}
      style={{
        left: viewport.left,
        top: viewport.top,
        width: viewport.width,
        height: viewport.height,
      }}
    >
      {target && renderedPageRects.length > 0 && (
        <div
          className="attachment-pin-overlay__banner"
          role="status"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="attachment-pin-overlay__banner-badge">
            <Icon name="map-pin" size={14} />
          </div>
          <span className="attachment-pin-overlay__banner-text">
            {t(
              "attachments.placingPin",
              "Click anywhere on a page to place pin for {{name}}",
              { name: target.name },
            )}
            <kbd className="attachment-pin-overlay__banner-kbd">Esc</kbd>
          </span>
          <Button size="sm" variant="tertiary" type="button" onClick={onCancel}>
            {t("cancel", "Cancel")}
          </Button>
        </div>
      )}

      {renderedPageRects.map((rect) => {
        const pagePins = pins.filter((pin) => pin.pageIndex === rect.pageIndex);
        const isGhostOnThisPage = ghostPin?.pageIndex === rect.pageIndex;

        return (
          <div
            key={rect.pageIndex}
            className={`attachment-pin-overlay__page${
              target ? " attachment-pin-overlay__page--active" : ""
            }`}
            data-testid="attachment-pin-page"
            style={{
              left: rect.left - viewport.left,
              top: rect.top - viewport.top,
              width: rect.width,
              height: rect.height,
            }}
            onClick={target ? handlePageClick(rect) : undefined}
            onMouseMove={target ? handlePageMouseMove(rect) : undefined}
            onMouseLeave={target ? handlePageMouseLeave : undefined}
          >
            {pagePins.map((pin) => {
              const openLabel = pin.openName
                ? t("attachments.openPin", "Open attachment: {{name}}", {
                    name: pin.name,
                  })
                : t(
                    "attachments.pinNotSaved",
                    "Save the attachment before opening its pin",
                  );
              return (
                <Tooltip key={pin.id} label={openLabel} withArrow offset={6}>
                  <button
                    type="button"
                    className="attachment-pin-overlay__marker"
                    title={openLabel}
                    data-open-name={pin.openName ?? ""}
                    aria-label={openLabel}
                    disabled={!pin.openName}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (pin.openName) {
                        onOpenPin?.(pin.openName);
                      }
                    }}
                    style={{
                      left: `${pin.x * 100}%`,
                      top: `${pin.y * 100}%`,
                      pointerEvents: target ? "none" : undefined,
                    }}
                  >
                    <AttachmentPinGraphic />
                  </button>
                </Tooltip>
              );
            })}

            {target && isGhostOnThisPage && (
              <div
                className="attachment-pin-overlay__ghost"
                style={{
                  left: `${ghostPin.xPercent * 100}%`,
                  top: `${ghostPin.yPercent * 100}%`,
                }}
              >
                <AttachmentPinGraphic />
              </div>
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
