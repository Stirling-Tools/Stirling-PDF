import { useCallback, useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/** Rows above and below the viewport kept mounted, so a fast scroll stays filled. */
const OVERSCAN = 3;

/**
 * How many columns the grid is actually laying out. Read off the computed style
 * rather than recomputed from a breakpoint, so `auto-fill` stays the one place the
 * column count is decided.
 */
function useColumnCount(el: HTMLElement | null): number {
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    if (!el) return;
    const read = () => {
      const template = getComputedStyle(el).gridTemplateColumns;
      const n =
        template === "none" ? 1 : template.split(" ").filter(Boolean).length;
      setColumns(Math.max(1, n));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return columns;
}

/** The scrolling ancestor the virtualiser measures against. */
function useScrollParent(el: HTMLElement | null): HTMLElement | null {
  const [parent, setParent] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setParent(el?.closest<HTMLElement>(".files-page-content") ?? null);
  }, [el]);
  return parent;
}

export interface VirtualFileRows {
  /** The slice to render, or every index when virtualisation is standing down. */
  range: { start: number; end: number };
  /** Height to leave above and below the slice, keeping the scrollbar honest. */
  padTop: number;
  padBottom: number;
  columns: number;
  /** Ref for the element the rows live in. */
  setContainer: (el: HTMLDivElement | null) => void;
}

/**
 * Renders a window of a long file list instead of all of it, as a slice plus a
 * spacer at each end. Spacers rather than absolute positioning so the grid keeps
 * its own `auto-fill` layout and the list its own row flow.
 *
 * Stands down - every item rendered, no spacers - until there is a scrolling
 * ancestor with a measured height. That covers a short list, the first paint
 * before layout, and any environment without real geometry.
 */
export function useVirtualFileRows(
  itemCount: number,
  rowHeightEstimate: number,
  isGrid: boolean,
): VirtualFileRows {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const scrollParent = useScrollParent(container);
  const measuredColumns = useColumnCount(isGrid ? container : null);
  const columns = isGrid ? measuredColumns : 1;
  const rowCount = Math.ceil(itemCount / columns);

  const getScrollElement = useCallback(() => scrollParent, [scrollParent]);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement,
    estimateSize: () => rowHeightEstimate,
    overscan: OVERSCAN,
  });

  const rows = virtualizer.getVirtualItems();
  const active = Boolean(scrollParent) && rows.length > 0;

  return useMemo(() => {
    if (!active) {
      return {
        range: { start: 0, end: itemCount },
        padTop: 0,
        padBottom: 0,
        columns,
        setContainer,
      };
    }
    const first = rows[0];
    const last = rows[rows.length - 1];
    return {
      range: {
        start: first.index * columns,
        end: Math.min((last.index + 1) * columns, itemCount),
      },
      padTop: first.start,
      padBottom: Math.max(0, virtualizer.getTotalSize() - last.end),
      columns,
      setContainer,
    };
  }, [active, rows, columns, itemCount, virtualizer]);
}

// Read once. The root font size is a layout read, and this is called on every render
// of a list whose whole point is not doing needless work. A root restyled mid-session
// keeps the first answer, which only shifts an estimate.
let rootFontSizePx = 0;

/** Card and row heights including their gap, matching contain-intrinsic-size. */
export function rowHeightPx(isGrid: boolean): number {
  if (rootFontSizePx === 0) {
    rootFontSizePx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }
  return isGrid ? 14 * rootFontSizePx : 3 * rootFontSizePx;
}
