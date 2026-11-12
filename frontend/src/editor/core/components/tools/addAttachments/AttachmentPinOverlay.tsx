import { useCallback, useEffect, useRef, useState } from "react";
import type { WheelEvent } from "react";
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
  onRemovePin?: (id: string) => void;
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

interface PointerPoint {
  x: number;
  y: number;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Nearest scrollable ancestor that owns the viewer's page geometry. */
function findScrollContainer(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function findPageElement(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>("[data-page-index]") ?? null;
}

function ghostPinAt(
  page: HTMLElement,
  clientX: number,
  clientY: number,
): GhostPinState | null {
  const pageIndex = Number(page.dataset.pageIndex);
  const rect = page.getBoundingClientRect();
  if (!Number.isFinite(pageIndex) || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    pageIndex,
    xPercent: clampUnit((clientX - rect.left) / rect.width),
    yPercent: clampUnit((clientY - rect.top) / rect.height),
  };
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

function sameGhostPin(
  a: GhostPinState | null,
  b: GhostPinState | null,
): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.pageIndex === b.pageIndex &&
      a.xPercent === b.xPercent &&
      a.yPercent === b.yPercent)
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
 *
 * The layer never captures pointer events, so wheel, trackpad, scrollbar and
 * touch panning keep working while pins are being placed. Page clicks are
 * resolved against the real page element instead of the overlay.
 */
export function AttachmentPinOverlay({
  target,
  pins,
  onPlace,
  onOpenPin,
  onRemovePin,
  onCancel,
}: AttachmentPinOverlayProps) {
  const { t } = useTranslation();
  const [pageRects, setPageRects] = useState<PageRect[]>([]);
  const [viewport, setViewport] = useState<ViewportRect>(fullViewport);
  const [ghostPin, setGhostPin] = useState<GhostPinState | null>(null);
  const frameRef = useRef<number | null>(null);
  const targetRef = useRef(target);
  const lastPointerRef = useRef<PointerPoint | null>(null);
  targetRef.current = target;

  /** Wheel over a pin or the banner would otherwise miss the viewer's scroller. */
  const forwardWheelToViewer = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const pageElement =
        document.querySelector<HTMLElement>("[data-page-index]");
      const scroller = pageElement ? findScrollContainer(pageElement) : null;
      if (!scroller) return;
      scroller.scrollBy({ top: event.deltaY, left: event.deltaX });
    },
    [],
  );

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

    // Scrolling moves pages under a stationary cursor: re-resolve the ghost
    // pin so the preview stays under the pointer instead of drifting away.
    const pointer = lastPointerRef.current;
    if (targetRef.current && pointer) {
      const page = findPageElement(
        document.elementFromPoint(pointer.x, pointer.y),
      );
      const nextGhost = page ? ghostPinAt(page, pointer.x, pointer.y) : null;
      setGhostPin((previous) =>
        sameGhostPin(previous, nextGhost) ? previous : nextGhost,
      );
    }
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
      lastPointerRef.current = null;
      return;
    }

    document.body.classList.add("attachment-pin-placing");
    let downPoint: PointerPoint | null = null;

    const onPointerDown = (event: PointerEvent) => {
      downPoint =
        event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    };

    const onPointerMove = (event: PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      const page = findPageElement(
        document.elementFromPoint(event.clientX, event.clientY),
      );
      const nextGhost = page
        ? ghostPinAt(page, event.clientX, event.clientY)
        : null;
      setGhostPin((previous) =>
        sameGhostPin(previous, nextGhost) ? previous : nextGhost,
      );
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      // A drag is a pan or text-selection gesture, not a pin placement.
      if (
        downPoint &&
        Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y) > 6
      ) {
        return;
      }
      const page = findPageElement(event.target as Element | null);
      if (!page) return;
      const point = ghostPinAt(page, event.clientX, event.clientY);
      if (!point) return;
      event.preventDefault();
      event.stopPropagation();
      onPlace(point.pageIndex, point.xPercent, point.yPercent);
    };

    const onWindowBlur = () => {
      lastPointerRef.current = null;
      setGhostPin(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("attachment-pin-placing");
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel, onPlace, target]);

  if (!target && pins.length === 0) {
    return null;
  }

  const renderedPageRects = target
    ? pageRects
    : pageRects.filter((rect) =>
        pins.some((pin) => pin.pageIndex === rect.pageIndex),
      );

  return createPortal(
    <div
      className={`attachment-pin-overlay${target ? " attachment-pin-overlay--placing" : ""}`}
      data-testid="attachment-pin-overlay"
      onWheel={forwardWheelToViewer}
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
          data-testid="attachment-pin-banner"
        >
          <div className="attachment-pin-overlay__banner-badge">
            <Icon name="map-pin" size={14} />
          </div>
          <div className="attachment-pin-overlay__banner-copy">
            <span className="attachment-pin-overlay__banner-text">
              {t(
                "attachments.placingPin",
                "Click a page to place the pin for {{name}}",
                { name: target.name },
              )}
            </span>
            <span className="attachment-pin-overlay__banner-help">
              {t(
                "attachments.placingPinHelp",
                "Scroll to reach more pages, or press Esc to cancel.",
              )}
            </span>
          </div>
          <Button size="sm" variant="tertiary" type="button" onClick={onCancel}>
            {t("cancel", "Cancel")}
          </Button>
        </div>
      )}

      {renderedPageRects.map((rect) => {
        const pagePins = pins.filter((pin) => pin.pageIndex === rect.pageIndex);
        const isGhostOnThisPage = ghostPin?.pageIndex === rect.pageIndex;
        const isHovered = Boolean(target) && isGhostOnThisPage;

        return (
          <div
            key={rect.pageIndex}
            className={`attachment-pin-overlay__page${isHovered ? " attachment-pin-overlay__page--hovered" : ""}`}
            data-testid="attachment-pin-page"
            style={{
              left: rect.left - viewport.left,
              top: rect.top - viewport.top,
              width: rect.width,
              height: rect.height,
            }}
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
              const removeLabel = t("attachments.removePin", "Remove pin");
              return (
                <div
                  key={pin.id}
                  className="attachment-pin-overlay__marker-wrap"
                  style={{
                    left: `${pin.x * 100}%`,
                    top: `${pin.y * 100}%`,
                  }}
                >
                  <Tooltip label={openLabel} withArrow offset={6}>
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
                    >
                      <AttachmentPinGraphic />
                    </button>
                  </Tooltip>
                  {onRemovePin && (
                    <Tooltip label={removeLabel} withArrow offset={4}>
                      <button
                        type="button"
                        className="attachment-pin-overlay__marker-remove"
                        aria-label={removeLabel}
                        title={removeLabel}
                        data-testid={`attachment-pin-remove-${pin.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemovePin(pin.id);
                        }}
                      >
                        <Icon name="x" size={11} strokeWidth={2.6} />
                      </button>
                    </Tooltip>
                  )}
                </div>
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
