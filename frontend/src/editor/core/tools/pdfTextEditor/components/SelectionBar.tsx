import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import { FormatGroup } from "@editor/tools/pdfTextEditor/components/toolbar/FormatGroup";
import { ObjectGroup } from "@editor/tools/pdfTextEditor/components/toolbar/ObjectGroup";
import { ImageGroup } from "@editor/tools/pdfTextEditor/components/toolbar/ImageGroup";
import {
  GeometryMenu,
  SelectionNotices,
} from "@editor/tools/pdfTextEditor/components/toolbar/DetailsGroup";
import { ScanFontMatchModal } from "@editor/tools/pdfTextEditor/components/inspector/ScanFontMatchModal";
import { useSelectionGeometry } from "@editor/tools/pdfTextEditor/hooks/useSelectionGeometry";
import { useSelectionNote } from "@editor/tools/pdfTextEditor/hooks/useSelectedFontNote";
import { useScanFontMatch } from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";
import { useEditorContextMenu } from "@editor/tools/pdfTextEditor/store/contextMenu";
import {
  SELECTION_BAR_MENU_ATTR,
  ToolbarSeparator,
} from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import "@editor/tools/pdfTextEditor/components/SelectionBar.css";

const GAP_PX = 8;
const EDGE_PX = 12;

interface Placement {
  left: number;
  top: number;
  /** Hangs down from `top` rather than sitting above it. */
  below: boolean;
  maxWidth: number;
}

function selectedElements(selection: SelectionState): HTMLElement[] {
  const ids = [
    ...selection.runIds.map((id) => `pdf-editor-run-${id}`),
    ...selection.imageIds.map((id) => `pdf-editor-image-${id}`),
    ...selection.shapeIds.map((id) => `pdf-editor-shape-${id}`),
  ];
  return ids.flatMap((id) => {
    const el = document.querySelector<HTMLElement>(
      `[data-testid="${CSS.escape(id)}"]`,
    );
    return el ? [el] : [];
  });
}

/** Under the pointer: the bar itself or one of its open menus. */
function isInUse(bar: HTMLElement | null): boolean {
  if (!bar) return false;
  return (
    bar.matches(":hover") ||
    !!document.querySelector(`[${SELECTION_BAR_MENU_ATTR}]:hover`)
  );
}

/**
 * Re-measured every frame: scrolling, zooming, dragging and typing move the
 * selection without an event, and the reads are cheap while layout is clean.
 * Null until the pages exist.
 */
function useSelectionPlacement(
  selection: SelectionState,
  active: boolean,
  barRef: RefObject<HTMLDivElement | null>,
): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);

  useEffect(() => {
    if (!active) {
      setPlacement(null);
      return;
    }
    let els: HTMLElement[] = [];
    const expected =
      selection.runIds.length +
      selection.imageIds.length +
      selection.shapeIds.length;
    let frame = 0;
    let last = "";
    const tick = () => {
      frame = requestAnimationFrame(tick);
      // A change made from the bar, such as a bigger font size, resizes the
      // selection; the bar stays put under the pointer until the user leaves it.
      if (last && isInUse(barRef.current)) return;
      // Pages mount and unmount as they scroll; look the nodes up again then.
      if (els.length < expected || els.some((el) => !el.isConnected)) {
        els = selectedElements(selection);
      }
      const pages = document.querySelector("[data-viewer-pages]");
      let next: Placement | null = null;
      if (pages) {
        const clip = pages.getBoundingClientRect();
        const bar = barRef.current;
        const height = bar?.offsetHeight ?? 0;
        const width = bar?.offsetWidth ?? 0;
        const maxWidth = Math.max(0, clip.width - EDGE_PX * 2);
        const half = Math.min(width, maxWidth) / 2;
        let top = Infinity;
        let bottom = -Infinity;
        let left = Infinity;
        let right = -Infinity;
        for (const el of els) {
          const r = el.getBoundingClientRect();
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
          left = Math.min(left, r.left);
          right = Math.max(right, r.right);
        }
        const onScreen =
          els.length > 0 &&
          bottom > clip.top &&
          top < clip.bottom &&
          right > clip.left &&
          left < clip.right;
        // Scrolled away or on an unmounted page: pinned to the top of the pages.
        const centre = onScreen
          ? (left + right) / 2
          : clip.left + clip.width / 2;
        const below = !onScreen || top - GAP_PX - height < clip.top;
        const anchor = !onScreen
          ? clip.top + GAP_PX
          : below
            ? bottom + GAP_PX
            : top - GAP_PX;
        next = {
          left: Math.min(
            Math.max(centre, clip.left + EDGE_PX + half),
            clip.right - EDGE_PX - half,
          ),
          // A selection taller than the view keeps the bar inside it.
          top: below
            ? Math.max(
                clip.top + GAP_PX,
                Math.min(anchor, clip.bottom - GAP_PX - height),
              )
            : anchor,
          below,
          maxWidth,
        };
      }
      const key = next
        ? `${Math.round(next.left)}|${Math.round(next.top)}|${next.below}|${Math.round(next.maxWidth)}`
        : "";
      if (key !== last) {
        last = key;
        setPlacement(next);
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [selection, active, barRef]);

  return placement;
}

interface SelectionBarProps {
  store: EditorStore;
  state: EditorViewState;
  selection: SelectionState;
}

/** Formatting, image tools and arranging for the current selection, floating beside it on the page. */
export const SelectionBar = memo(function SelectionBar({
  store,
  state,
  selection,
}: SelectionBarProps) {
  const { t } = useTranslation();
  const barRef = useRef<HTMLDivElement | null>(null);
  // Where focus came from into the bar, for Escape to hand it back.
  const cameFromRef = useRef<HTMLElement | null>(null);
  const controller = useToolbarController(store, state, selection);
  const geometry = useSelectionGeometry(store, state, selection);
  const note = useSelectionNote(store, state, selection);
  const scanFontMatch = useScanFontMatch(store, state, selection);
  const active = controller.selectionCount > 0;
  const contextMenuOpen = useEditorContextMenu() !== null;
  const placement = useSelectionPlacement(selection, active, barRef);

  // Portalled to the end of the page, the bar is last in tab order; Alt+F10 is
  // the usual shortcut into a toolbar.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.key !== "F10") return;
      const first = barRef.current?.querySelector<HTMLElement>(
        "button:not(:disabled), input:not(:disabled)",
      );
      if (!first) return;
      e.preventDefault();
      first.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  // Outlives the bar, which hides while the right-click menu is open.
  const scanFontModal = scanFontMatch && (
    <ScanFontMatchModal match={scanFontMatch} />
  );
  // One menu at a time: the right-click menu stands in for the bar while open.
  if (!active || contextMenuOpen) return scanFontModal;
  // Menus open on the side of the bar away from the selection, clear of its text.
  const dropdownPosition = placement?.below ? "bottom" : "top";

  const { hasRunSelection, hasImageSelection } = controller;
  const bar = createPortal(
    <div
      ref={barRef}
      role="toolbar"
      aria-label={t("pdfTextEditor.selectionBar.label", "Selection")}
      className="pdf-editor-selection-bar"
      data-below={placement?.below ? "true" : "false"}
      data-testid="pdf-editor-selection-bar"
      onFocus={(e) => {
        const from = e.relatedTarget;
        if (
          from instanceof HTMLElement &&
          !barRef.current?.contains(from) &&
          !from.closest(`[${SELECTION_BAR_MENU_ATTR}]`)
        )
          cameFromRef.current = from;
      }}
      onKeyDown={(e) => {
        // Open menus close on their own Escape; elsewhere Escape leaves the bar.
        const target = e.target as HTMLElement;
        if (
          e.key !== "Escape" ||
          !barRef.current?.contains(target) ||
          target.getAttribute("aria-expanded") === "true"
        )
          return;
        const back = cameFromRef.current;
        cameFromRef.current = null;
        if (back?.isConnected) back.focus({ preventScroll: true });
        else target.blur();
      }}
      // Hidden until placed: placing it needs its own size.
      style={
        placement
          ? {
              left: placement.left,
              top: placement.top,
              maxWidth: placement.maxWidth,
            }
          : { visibility: "hidden", left: 0, top: 0 }
      }
    >
      {controller.hasRunSelection && (
        <>
          <FormatGroup
            controller={controller}
            compact
            dropdownPosition={dropdownPosition}
          />
          <ToolbarSeparator />
        </>
      )}
      {controller.hasImageSelection && (
        <>
          <ImageGroup controller={controller} />
          <ToolbarSeparator />
        </>
      )}
      {(hasRunSelection || hasImageSelection) && (
        <>
          <GeometryMenu
            geometry={geometry}
            isImage={!hasRunSelection}
            dropdownPosition={dropdownPosition}
          />
          <SelectionNotices
            note={hasRunSelection ? note : null}
            scanFontMatch={scanFontMatch}
          />
          <ToolbarSeparator />
        </>
      )}
      <ObjectGroup
        controller={controller}
        dropdownPosition={dropdownPosition}
      />
    </div>,
    document.body,
  );
  return (
    <>
      {bar}
      {scanFontModal}
    </>
  );
});
