import type { CSSProperties } from "react";
import "@app/ui/CarouselDots.css";

/** default = blue pill on light surfaces; onImage = white dots over dark photography. */
export type CarouselDotsTone = "default" | "onImage";

export interface CarouselDotsProps {
  /** Number of slides / dots. */
  count: number;
  /** Zero-based index of the active slide. */
  activeIndex: number;
  /** Called with the clicked dot's index; omit to render non-interactive dots. */
  onSelect?: (index: number) => void;
  /** Accessible label for the dot group. */
  label?: string;
  /** Accessible label for each dot; receives the zero-based index. */
  dotLabel?: (index: number) => string;
  tone?: CarouselDotsTone;
  className?: string;
  style?: CSSProperties;
}

/** Carousel pagination indicator: active dot is a wider pill, inactive dots are ovals. */
export function CarouselDots({
  count,
  activeIndex,
  onSelect,
  label,
  dotLabel,
  tone = "default",
  className,
  style,
}: CarouselDotsProps) {
  const classes = [
    "sui-carousel-dots",
    `sui-carousel-dots--${tone}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={style} role="group" aria-label={label}>
      {Array.from({ length: Math.max(0, count) }).map((_, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={i}
            type="button"
            className={"sui-carousel-dots__dot" + (active ? " is-active" : "")}
            aria-current={active ? "true" : undefined}
            aria-label={dotLabel ? dotLabel(i) : `Go to slide ${i + 1}`}
            onClick={onSelect ? () => onSelect(i) : undefined}
          />
        );
      })}
    </div>
  );
}
