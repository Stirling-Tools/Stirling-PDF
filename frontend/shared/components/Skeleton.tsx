import "@shared/components/Skeleton.css";

export interface SkeletonProps {
  /** Width as a CSS length (`100%`, `12rem`, …). Defaults to 100%. */
  width?: string | number;
  /** Height as a CSS length. Defaults to 0.75rem. */
  height?: string | number;
  /** Shape preset. `text` = pill-rounded line, `rect` = card / image area. */
  shape?: "text" | "rect" | "circle";
  /** For text shape, the number of stacked lines to render. */
  lines?: number;
  className?: string;
}

/**
 * Shimmering placeholder for content that hasn't loaded yet. Replaces the
 * ad-hoc `linear-gradient(...) shimmer 1.4s` blocks that were duplicated
 * across the deployed-pipelines table, the activity feed, and the doc-type
 * grid.
 */
export function Skeleton({
  width = "100%",
  height,
  shape = "text",
  lines = 1,
  className,
}: SkeletonProps) {
  const dim = (v: string | number | undefined) =>
    typeof v === "number" ? `${v}px` : v;

  if (shape === "text" && lines > 1) {
    return (
      <span
        className={["sui-skel-lines", className ?? ""]
          .filter(Boolean)
          .join(" ")}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className="sui-skel sui-skel--text"
            style={{
              // Last line is slightly shorter — feels more natural.
              width: i === lines - 1 ? "70%" : (dim(width) ?? "100%"),
              height: dim(height) ?? "0.75rem",
            }}
          />
        ))}
      </span>
    );
  }

  return (
    <span
      className={["sui-skel", `sui-skel--${shape}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: dim(width),
        height:
          dim(height) ??
          (shape === "text" ? "0.75rem" : shape === "circle" ? "2rem" : "6rem"),
      }}
      aria-hidden
    />
  );
}
