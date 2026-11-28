interface UprightStampImageProps {
  src: string;
  /** The box's size in page space, before the enclosing <Rotate>. */
  width: number;
  height: number;
  /** Quarter turns to undo, so the image reads upright as the page is shown. */
  turns: number;
}

/** Fills a page-space box with an image turned back by the page's /Rotate. */
export function UprightStampImage({
  src,
  width,
  height,
  turns,
}: UprightStampImageProps) {
  const quarterTurn = turns % 2 === 1;
  const shownWidth = quarterTurn ? height : width;
  const shownHeight = quarterTurn ? width : height;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      data-upright-turns={turns}
      style={{
        position: "absolute",
        left: (width - shownWidth) / 2,
        top: (height - shownHeight) / 2,
        width: shownWidth,
        height: shownHeight,
        transform: turns ? `rotate(${-90 * turns}deg)` : undefined,
        display: "block",
        pointerEvents: "none",
        userSelect: "none",
      }}
    />
  );
}
