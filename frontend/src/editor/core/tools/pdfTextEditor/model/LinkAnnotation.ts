/** An area of the page, in page space (y-up). */
export interface PageArea {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

/** A link annotation the file has, as the save addresses it. */
export interface LinkAnnotation {
  /** Its object number, which the save gives it to an element by. */
  annotation: number;
  /**
   * What it covers: the box around each of its /QuadPoints quadrilaterals,
   * or its /Rect when it has none.
   */
  areas: PageArea[];
  /** Its /Contents as the file has it; null when it has none. */
  contents: string | null;
  /** The key of the element the file gives it to; null when none. */
  holder: string | null;
}

export function areaContains(
  area: PageArea,
  point: { x: number; y: number },
): boolean {
  return (
    point.x >= area.left &&
    point.x <= area.right &&
    point.y >= area.bottom &&
    point.y <= area.top
  );
}
