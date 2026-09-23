import React from "react";
import { Icon } from "@app/ui/Icon";

import type { NonPdfFileType } from "@app/utils/fileUtils";

export interface FileTypeMeta {
  label: string;
  icon: React.ReactNode;
  color: string; // Mantine color name (e.g. 'teal', 'violet')
  accentColor: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
}

// Shared neutral color scheme for all file type badges — consistent in light & dark mode
const BADGE_COLORS = {
  color: "gray" as const,
  accentColor: "var(--mantine-color-gray-6)",
  borderColor: "var(--mantine-color-gray-3)",
  bgColor: "var(--mantine-color-gray-0)",
  textColor: "var(--mantine-color-gray-9)",
};

export function getFileTypeMeta(
  type: NonPdfFileType,
  fileName?: string,
): FileTypeMeta {
  switch (type) {
    case "image":
      return {
        label: "Image",
        icon: React.createElement(Icon, { name: "image", size: 20 }),
        ...BADGE_COLORS,
      };
    case "csv":
      return {
        label: "Spreadsheet",
        icon: React.createElement(Icon, { name: "table", size: 20 }),
        ...BADGE_COLORS,
      };
    case "json":
      return {
        label: "JSON",
        icon: React.createElement(Icon, { name: "braces", size: 20 }),
        ...BADGE_COLORS,
      };
    case "markdown":
      return {
        label: "Markdown",
        icon: React.createElement(Icon, { name: "code", size: 20 }),
        ...BADGE_COLORS,
      };
    case "html":
      return {
        label: "HTML",
        icon: React.createElement(Icon, { name: "file-html", size: 20 }),
        ...BADGE_COLORS,
      };
    case "text":
      return {
        label: "Text",
        icon: React.createElement(Icon, { name: "file-text", size: 20 }),
        ...BADGE_COLORS,
      };
    default: {
      // For unknown types, derive label from the file extension (e.g. ".docx" → "DOCX")
      const ext = fileName?.split(".").pop()?.toUpperCase();
      const label = ext || "File";
      return {
        label,
        icon: React.createElement(Icon, { name: "file-text", size: 20 }),
        ...BADGE_COLORS,
      };
    }
  }
}
