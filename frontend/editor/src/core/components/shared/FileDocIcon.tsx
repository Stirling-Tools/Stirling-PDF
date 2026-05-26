export type FileDocVariant =
  | "pdf"
  | "spreadsheet"
  | "doc"
  | "image"
  | "archive"
  | "code"
  | "generic";

export const VARIANT_COLORS: Record<FileDocVariant, string> = {
  pdf: "#DC2626",
  spreadsheet: "#16a34a",
  doc: "#2563eb",
  image: "#7c3aed",
  archive: "#ea580c",
  code: "#0891b2",
  generic: "#71717a",
};

export function FileDocIcon({
  color,
  variant,
  className,
  style,
}: {
  color?: string;
  variant: FileDocVariant;
  className?: string;
  style?: React.CSSProperties;
}) {
  color ??= VARIANT_COLORS[variant];
  const foldX = 10.5;
  const foldY = 5.5;

  let interior: React.ReactNode;
  if (variant === "spreadsheet") {
    // Outer border of the grid
    const gx1 = 3,
      gy1 = 8,
      gx2 = 13,
      gy2 = 17;
    // Column divider x, row divider y positions
    const colX = 8;
    const row1Y = 11,
      row2Y = 14;
    interior = (
      <g opacity="0.7" stroke={color} strokeWidth="1" fill="none">
        <rect x={gx1} y={gy1} width={gx2 - gx1} height={gy2 - gy1} rx="0.5" />
        <line x1={colX} y1={gy1} x2={colX} y2={gy2} />
        <line x1={gx1} y1={row1Y} x2={gx2} y2={row1Y} />
        <line x1={gx1} y1={row2Y} x2={gx2} y2={row2Y} />
      </g>
    );
  } else if (variant === "image") {
    interior = (
      <>
        <polyline
          points="2.5,16 5.5,11.5 8,14 10,12 13.5,16"
          stroke={color}
          strokeWidth="1.1"
          opacity="0.6"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx="11"
          cy="9.5"
          r="1.3"
          stroke={color}
          strokeWidth="1"
          opacity="0.6"
          fill="none"
        />
      </>
    );
  } else if (variant === "code") {
    interior = (
      <>
        <polyline
          points="6,9.5 3.5,12.5 6,15.5"
          stroke={color}
          strokeWidth="1.3"
          opacity="0.7"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="10,9.5 12.5,12.5 10,15.5"
          stroke={color}
          strokeWidth="1.3"
          opacity="0.7"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    );
  } else if (variant === "archive") {
    interior = (
      <>
        <line
          x1="5"
          y1="9.5"
          x2="11"
          y2="9.5"
          stroke={color}
          strokeWidth="1.1"
          opacity="0.6"
          strokeDasharray="2,1.5"
          strokeLinecap="round"
        />
        <line
          x1="5"
          y1="12"
          x2="11"
          y2="12"
          stroke={color}
          strokeWidth="1.1"
          opacity="0.6"
          strokeDasharray="2,1.5"
          strokeLinecap="round"
        />
        <line
          x1="5"
          y1="14.5"
          x2="11"
          y2="14.5"
          stroke={color}
          strokeWidth="1.1"
          opacity="0.6"
          strokeDasharray="2,1.5"
          strokeLinecap="round"
        />
      </>
    );
  } else {
    // pdf, doc, generic — text lines
    interior = (
      <>
        <line
          x1="3.5"
          y1="9.5"
          x2="12.5"
          y2="9.5"
          stroke={color}
          strokeWidth="1.1"
          opacity="0.6"
          strokeLinecap="round"
        />
        <line
          x1="3.5"
          y1="12"
          x2="12.5"
          y2="12"
          stroke={color}
          strokeWidth="1.1"
          opacity="0.6"
          strokeLinecap="round"
        />
        <line
          x1="3.5"
          y1="14.5"
          x2="8.5"
          y2="14.5"
          stroke={color}
          strokeWidth="1.1"
          opacity="0.6"
          strokeLinecap="round"
        />
      </>
    );
  }

  return (
    <svg
      className={className}
      style={{ width: 16, height: 20, ...style }}
      viewBox="0 0 16 20"
      fill="none"
      aria-hidden="true"
    >
      {/* Document outline with top-right page fold */}
      <path
        d={`M 1.5,1 H ${foldX} L 15,${foldY} V 18.5 Q 15,19 14.5,19 H 1.5 Q 1,19 1,18.5 V 1.5 Q 1,1 1.5,1 Z`}
        stroke={color}
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
      />
      {/* Fold corner triangle */}
      <path
        d={`M ${foldX},1 L ${foldX},${foldY} L 15,${foldY} Z`}
        stroke={color}
        strokeWidth="1.3"
        fill={color}
        fillOpacity="0.2"
        strokeLinejoin="round"
      />
      {interior}
    </svg>
  );
}
