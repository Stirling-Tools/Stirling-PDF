import FileDocArchive from "@app/assets/file-types/file-doc-archive.svg?react";
import FileDocCode from "@app/assets/file-types/file-doc-code.svg?react";
import FileDocImage from "@app/assets/file-types/file-doc-image.svg?react";
import FileDocSheet from "@app/assets/file-types/file-doc-sheet.svg?react";
import FileDocText from "@app/assets/file-types/file-doc-text.svg?react";
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

const DRAWINGS: Record<FileDocVariant, typeof FileDocText> = {
  pdf: FileDocText,
  spreadsheet: FileDocSheet,
  doc: FileDocText,
  image: FileDocImage,
  archive: FileDocArchive,
  code: FileDocCode,
  generic: FileDocText,
};

/** Portrait (16x20) rather than a square registry icon: callers size it by one edge and rely on that shape. */
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
  const Drawing = DRAWINGS[variant];
  return (
    <Drawing
      className={className}
      // The accent flows through `color` (var() resolves in CSS, not in SVG
      // presentation attributes) and the shapes pick it up via currentColor.
      style={{
        width: 16,
        height: 20,
        color: color ?? VARIANT_COLORS[variant],
        ...style,
      }}
      aria-hidden="true"
      focusable={false}
    />
  );
}
