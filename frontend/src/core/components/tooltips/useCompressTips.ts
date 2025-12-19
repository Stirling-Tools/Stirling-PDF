import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useCompressTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("compress.help.title", "PDF Compression Guide")
    },
    tips: [
      {
        title: t("compress.help.overview", "Overview"),
        description: t("compress.help.overview", "Reduce PDF file size while balancing quality. Uses qpdf for compression and optimization.")
      },
      {
        title: t("compress.help.methods", "Compression Methods"),
        description: "",
        bullets: [
          t("compress.help.qualityMethod", "Quality: Choose compression strength (1-9). Lower preserves quality, higher reduces size more aggressively. Recommended: 3-5 for most documents."),
          t("compress.help.filesizeMethod", "File Size: Enter target size - tool automatically adjusts quality to reach it. Best when you have size limits (email attachments, etc.).")
        ]
      },
      {
        title: t("compress.help.options", "Additional Options"),
        description: "",
        bullets: [
          t("compress.help.grayscale", "Grayscale: Converts all colors to black & white. Dramatically reduces size for color-heavy documents. Best for: Text documents, reports, forms."),
          t("compress.help.lineArt", "Line Art: Maximum compression. Converts to high-contrast black & white (requires ImageMagick). Best for: Text-only documents, technical drawings. NOT recommended for photos.")
        ]
      },
      {
        title: t("compress.help.qualityLevels", "Quality Level Guide"),
        description: "",
        bullets: [
          t("compress.help.level1to3", "1-3: High quality. Minimal compression. Use for important documents, presentations, or photos."),
          t("compress.help.level4to6", "4-6: Balanced. Noticeable compression with acceptable quality. Good for general use."),
          t("compress.help.level7to9", "7-9: Maximum compression. Lower quality but smallest files. Use for drafts, internal documents.")
        ]
      },
      {
        title: t("compress.help.tips", "Tips"),
        description: "",
        bullets: [
          t("compress.help.tip1", "Start with quality level 3-4 and increase if more compression needed"),
          t("compress.help.tip2", "Grayscale option works well for scanned documents without photos"),
          t("compress.help.tip3", "Line art is extreme - preview results before using on final documents"),
          t("compress.help.tip4", "File size method is convenient but may produce varying quality across pages")
        ]
      },
      {
        title: t("compress.help.expectations", "Size Reduction Expectations"),
        description: "",
        bullets: [
          t("compress.help.typical", "Typical: 20-40% reduction for standard PDFs"),
          t("compress.help.images", "Image-heavy: 50-70% reduction with grayscale"),
          t("compress.help.extreme", "Line art: 80-95% reduction (text becomes images)")
        ]
      }
    ]
  };
};
