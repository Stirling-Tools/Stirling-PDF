import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';
import { SPLIT_METHODS, type SplitMethod } from '@app/constants/splitConstants';

export const useSplitSettingsTips = (method: SplitMethod | ''): TooltipContent | null => {
  const { t } = useTranslation();

  if (!method) return null;

  const tooltipMap: Record<SplitMethod, TooltipContent> = {
    [SPLIT_METHODS.BY_PAGES]: {
      header: {
        title: t("split.tooltip.byPages.title", "Split at Page Numbers")
      },
      tips: [
        {
          title: t("split.tooltip.byPages.title", "Split at Page Numbers"),
          description: t("split.tooltip.byPages.text", "Extract specific pages or ranges from your PDF. Use commas to separate individual pages and hyphens for ranges."),
          bullets: [
            t("split.tooltip.byPages.bullet1", "Single pages: 1,3,5"),
            t("split.tooltip.byPages.bullet2", "Page ranges: 1-5,10-15"),
            t("split.tooltip.byPages.bullet3", "Mixed: 1,3-7,12,15-20")
          ]
        }
      ]
    },

    [SPLIT_METHODS.BY_SECTIONS]: {
      header: {
        title: t("split.tooltip.bySections.title", "Split by Grid Sections")
      },
      tips: [
        {
          title: t("split.tooltip.bySections.title", "Split by Grid Sections"),
          description: t("split.tooltip.bySections.text", "Divide each page into a grid of sections. Useful for splitting documents with multiple columns or extracting specific areas."),
          bullets: [
            t("split.tooltip.bySections.bullet1", "Horizontal: Number of rows to create"),
            t("split.tooltip.bySections.bullet2", "Vertical: Number of columns to create"),
            t("split.tooltip.bySections.bullet3", "Merge: Combine all sections into one PDF")
          ]
        }
      ]
    },

    [SPLIT_METHODS.BY_SIZE]: {
      header: {
        title: t("split.tooltip.bySize.title", "Split by File Size")
      },
      tips: [
        {
          title: t("split.tooltip.bySize.title", "Split by File Size"),
          description: t("split.tooltip.bySize.text", "Create multiple PDFs that don't exceed a specified file size. Ideal for file size limitations or email attachments."),
          bullets: [
            t("split.tooltip.bySize.bullet1", "Use MB for larger files (e.g., 10MB)"),
            t("split.tooltip.bySize.bullet2", "Use KB for smaller files (e.g., 500KB)"),
            t("split.tooltip.bySize.bullet3", "System will split at page boundaries")
          ]
        }
      ]
    },

    [SPLIT_METHODS.BY_PAGE_COUNT]: {
      header: {
        title: t("split.tooltip.byPageCount.title", "Split by Page Count")
      },
      tips: [
        {
          title: t("split.tooltip.byPageCount.title", "Split by Page Count"),
          description: t("split.tooltip.byPageCount.text", "Create multiple PDFs with a specific number of pages each. Perfect for creating uniform document chunks."),
          bullets: [
            t("split.tooltip.byPageCount.bullet1", "Enter the number of pages per output file"),
            t("split.tooltip.byPageCount.bullet2", "Last file may have fewer pages if not evenly divisible"),
            t("split.tooltip.byPageCount.bullet3", "Useful for batch processing workflows")
          ]
        }
      ]
    },

    [SPLIT_METHODS.BY_DOC_COUNT]: {
      header: {
        title: t("split.tooltip.byDocCount.title", "Split by Document Count")
      },
      tips: [
        {
          title: t("split.tooltip.byDocCount.title", "Split by Document Count"),
          description: t("split.tooltip.byDocCount.text", "Create a specific number of output files by evenly distributing pages across them."),
          bullets: [
            t("split.tooltip.byDocCount.bullet1", "Enter the number of output files you want"),
            t("split.tooltip.byDocCount.bullet2", "Pages are distributed as evenly as possible"),
            t("split.tooltip.byDocCount.bullet3", "Useful when you need a specific number of files")
          ]
        }
      ]
    },

    [SPLIT_METHODS.BY_CHAPTERS]: {
      header: {
        title: t("split.tooltip.byChapters.title", "Split by Chapters")
      },
      tips: [
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
    },

    [SPLIT_METHODS.BY_PAGE_DIVIDER]: {
      header: {
        title: t("split.tooltip.byPageDivider.title", "Split by Page Divider")
      },
      tips: [
        {
          title: t("split.tooltip.byPageDivider.title", "Split by Page Divider"),
          description: t("split.tooltip.byPageDivider.text", "Automatically split scanned documents using physical divider sheets with QR codes. Perfect for processing multiple documents scanned together."),
          bullets: [
            t("split.tooltip.byPageDivider.bullet1", "Print divider sheets from the download link"),
            t("split.tooltip.byPageDivider.bullet2", "Insert divider sheets between your documents"),
            t("split.tooltip.byPageDivider.bullet3", "Scan all documents together as one PDF"),
            t("split.tooltip.byPageDivider.bullet4", "Upload - divider pages are automatically detected and removed"),
            t("split.tooltip.byPageDivider.bullet5", "Enable Duplex Mode if scanning both sides of divider sheets")
          ]
        }
      ]
    }
  };

  return tooltipMap[method];
};
