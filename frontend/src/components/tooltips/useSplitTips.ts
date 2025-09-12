import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

export const useSplitTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("split.tooltip.header.title", "Split Methods Overview")
    },
    tips: [
      {
        title: t("split.tooltip.byPages.title", "Split by Pages"),
        description: t("split.tooltip.byPages.text", "Extract specific pages or ranges from your PDF. Use commas to separate individual pages and hyphens for ranges."),
        bullets: [
          t("split.tooltip.byPages.bullet1", "Single pages: 1,3,5"),
          t("split.tooltip.byPages.bullet2", "Page ranges: 1-5,10-15"),
          t("split.tooltip.byPages.bullet3", "Mixed: 1,3-7,12,15-20")
        ]
      },
      {
        title: t("split.tooltip.bySections.title", "Split by Grid Sections"),
        description: t("split.tooltip.bySections.text", "Divide each page into a grid of sections. Useful for splitting documents with multiple columns or extracting specific areas."),
        bullets: [
          t("split.tooltip.bySections.bullet1", "Horizontal: Number of rows to create"),
          t("split.tooltip.bySections.bullet2", "Vertical: Number of columns to create"),
          t("split.tooltip.bySections.bullet3", "Merge: Combine all sections into one PDF")
        ]
      },
      {
        title: t("split.tooltip.bySize.title", "Split by File Size"),
        description: t("split.tooltip.bySize.text", "Create multiple PDFs that don't exceed a specified file size. Ideal for file size limitations or email attachments."),
        bullets: [
          t("split.tooltip.bySize.bullet1", "Use MB for larger files (e.g., 10MB)"),
          t("split.tooltip.bySize.bullet2", "Use KB for smaller files (e.g., 500KB)"),
          t("split.tooltip.bySize.bullet3", "System will split at page boundaries")
        ]
      },
      {
        title: t("split.tooltip.byCount.title", "Split by Count"),
        description: t("split.tooltip.byCount.text", "Create multiple PDFs with a specific number of pages or documents each."),
        bullets: [
          t("split.tooltip.byCount.bullet1", "Page Count: Fixed number of pages per file"),
          t("split.tooltip.byCount.bullet2", "Document Count: Fixed number of output files"),
          t("split.tooltip.byCount.bullet3", "Useful for batch processing workflows")
        ]
      },
      {
        title: t("split.tooltip.byChapters.title", "Split by Chapters"),
        description: t("split.tooltip.byChapters.text", "Use PDF bookmarks to automatically split at chapter boundaries. Requires PDFs with bookmark structure."),
        bullets: [
          t("split.tooltip.byChapters.bullet1", "Bookmark Level: Which level to split on (1=top level)"),
          t("split.tooltip.byChapters.bullet2", "Include Metadata: Preserve document properties"),
          t("split.tooltip.byChapters.bullet3", "Allow Duplicates: Handle repeated bookmark names")
        ]
      }
    ]
  };
};