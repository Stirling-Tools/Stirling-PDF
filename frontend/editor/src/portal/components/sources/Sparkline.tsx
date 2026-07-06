import "@portal/views/Sources.css";

interface SparklineProps {
  /** Series values, oldest first. */
  data: number[];
  /** Drawing height in px; the width fills the container. */
  height?: number;
  ariaLabel?: string;
}

/**
 * A tiny dependency-free trend line: normalises {@code data} to its own peak and draws a single
 * polyline. The viewBox is fixed while the rendered width fills the container (the stroke stays
 * crisp via non-scaling-stroke), so it adapts to any column without distorting the line weight.
 */
export function Sparkline({ data, height = 36, ariaLabel }: SparklineProps) {
  if (data.length === 0) {
    return null;
  }
  const width = 240;
  const pad = 3;
  const max = Math.max(...data, 1);
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data
    .map((value, i) => {
      const x = i * stepX;
      const y = pad + (1 - value / max) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="portal-sparkline"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
