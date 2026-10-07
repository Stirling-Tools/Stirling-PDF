import { Icon, type IconName } from "@app/ui/Icon";
import { accentColor } from "@app/utils/accentColors";

export type FileDocVariant =
  | "pdf"
  | "spreadsheet"
  | "doc"
  | "image"
  | "archive"
  | "code"
  | "generic";

// Theme-adaptive accent per file type (shared palette; see utils/accentColors.ts).
export const VARIANT_COLORS: Record<FileDocVariant, string> = {
  pdf: accentColor("red"),
  spreadsheet: accentColor("green"),
  doc: accentColor("blue"),
  image: accentColor("violet"),
  archive: accentColor("orange"),
  code: accentColor("cyan"),
  generic: accentColor("gray"),
};

const DRAWINGS: Record<FileDocVariant, IconName> = {
  pdf: "file-doc-text",
  spreadsheet: "file-doc-sheet",
  doc: "file-doc-text",
  image: "file-doc-image",
  archive: "file-doc-archive",
  code: "file-doc-code",
  generic: "file-doc-text",
};

/** The page is drawn 16x20 inside the 24x24 frame, so at `size` it matches a lucide glyph's ink height. */
export function FileDocIcon({
  color,
  variant,
  size,
  className,
  style,
}: {
  color?: string;
  variant: FileDocVariant;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Icon
      name={DRAWINGS[variant]}
      size={size}
      className={className}
      // The accent flows through `color` (var() resolves in CSS, not in SVG
      // presentation attributes) and the shapes pick it up via currentColor.
      style={{ color: color ?? VARIANT_COLORS[variant], ...style }}
    />
  );
}
