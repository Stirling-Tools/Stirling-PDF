import { useTranslation } from 'react-i18next';
import { TooltipContent, TooltipTip } from '@app/types/tips';

// Shared tooltip content to reduce duplication
const useSharedWatermarkContent = () => {
  const { t } = useTranslation();

  const languageSupportTip: TooltipTip = {
    title: t("watermark.tooltip.language.title", "Language Support"),
    description: t("watermark.tooltip.language.text", "Choose the appropriate language setting to ensure proper font rendering for your text.")
  };

  const appearanceTip: TooltipTip = {
    title: t("watermark.tooltip.appearance.title", "Appearance Settings"),
    description: t("watermark.tooltip.appearance.text", "Control how your watermark looks and blends with the document."),
    bullets: [
      t("watermark.tooltip.appearance.bullet1", "Rotation: -360° to 360° for angled watermarks"),
      t("watermark.tooltip.appearance.bullet2", "Opacity: 0-100% for transparency control"),
      t("watermark.tooltip.appearance.bullet3", "Lower opacity creates subtle watermarks")
    ]
  };

  const spacingTip: TooltipTip = {
    title: t("watermark.tooltip.spacing.title", "Spacing Control"),
    description: t("watermark.tooltip.spacing.text", "Adjust the spacing between repeated watermarks across the page."),
    bullets: [
      t("watermark.tooltip.spacing.bullet1", "Width spacing: Horizontal distance between watermarks"),
      t("watermark.tooltip.spacing.bullet2", "Height spacing: Vertical distance between watermarks"),
      t("watermark.tooltip.spacing.bullet3", "Higher values create more spread out patterns")
    ]
  };

  return { languageSupportTip, appearanceTip, spacingTip };
};

export const useWatermarkTypeTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("watermark.tooltip.type.header.title", "Watermark Type Selection")
    },
    tips: [
      {
        title: t("watermark.tooltip.type.description.title", "Choose Your Watermark"),
        description: t("watermark.tooltip.type.description.text", "Select between text or image watermarks based on your needs.")
      },
      {
        title: t("watermark.tooltip.type.text.title", "Text Watermarks"),
        description: t("watermark.tooltip.type.text.text", "Perfect for adding copyright notices, company names, or confidentiality labels. Supports multiple languages and custom colors."),
        bullets: [
          t("watermark.tooltip.type.text.bullet1", "Customizable fonts and languages"),
          t("watermark.tooltip.type.text.bullet2", "Adjustable colors and transparency"),
          t("watermark.tooltip.type.text.bullet3", "Ideal for legal or branding text")
        ]
      },
      {
        title: t("watermark.tooltip.type.image.title", "Image Watermarks"),
        description: t("watermark.tooltip.type.image.text", "Use logos, stamps, or any image as a watermark. Great for branding and visual identification."),
        bullets: [
          t("watermark.tooltip.type.image.bullet1", "Upload any image format"),
          t("watermark.tooltip.type.image.bullet2", "Maintains image quality"),
          t("watermark.tooltip.type.image.bullet3", "Perfect for logos and stamps")
        ]
      }
    ]
  };
};



export const useWatermarkWordingTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("watermark.tooltip.wording.header.title", "Text Content")
    },
    tips: [
      {
        title: t("watermark.tooltip.wording.text.title", "Watermark Text"),
        description: t("watermark.tooltip.wording.text.text", "Enter the text that will appear as your watermark across the document."),
        bullets: [
          t("watermark.tooltip.wording.text.bullet1", "Keep it concise for better readability"),
          t("watermark.tooltip.wording.text.bullet2", "Common examples: 'CONFIDENTIAL', 'DRAFT', company name"),
          t("watermark.tooltip.wording.text.bullet3", "Emoji characters are not supported and will be filtered out")
        ]
      }
    ]
  };
};

export const useWatermarkTextStyleTips = (): TooltipContent => {
  const { t } = useTranslation();
  const { languageSupportTip } = useSharedWatermarkContent();

  return {
    header: {
      title: t("watermark.tooltip.textStyle.header.title", "Text Style")
    },
    tips: [
      {
        title: t("watermark.tooltip.textStyle.color.title", "Color Selection"),
        description: t("watermark.tooltip.textStyle.color.text", "Choose a color that provides good contrast with your document content."),
        bullets: [
          t("watermark.tooltip.textStyle.color.bullet1", "Light gray (#d3d3d3) for subtle watermarks"),
          t("watermark.tooltip.textStyle.color.bullet2", "Black or dark colors for high contrast"),
          t("watermark.tooltip.textStyle.color.bullet3", "Custom colors for branding purposes")
        ]
      },
      languageSupportTip
    ]
  };
};

export const useWatermarkFileTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("watermark.tooltip.file.header.title", "Image Upload")
    },
    tips: [
      {
        title: t("watermark.tooltip.file.upload.title", "Image Selection"),
        description: t("watermark.tooltip.file.upload.text", "Upload an image file to use as your watermark."),
        bullets: [
          t("watermark.tooltip.file.upload.bullet1", "Supports common formats: PNG, JPG, GIF, BMP"),
          t("watermark.tooltip.file.upload.bullet2", "PNG with transparency works best"),
          t("watermark.tooltip.file.upload.bullet3", "Higher resolution images maintain quality better")
        ]
      },
      {
        title: t("watermark.tooltip.file.recommendations.title", "Best Practices"),
        description: t("watermark.tooltip.file.recommendations.text", "Tips for optimal image watermark results."),
        bullets: [
          t("watermark.tooltip.file.recommendations.bullet1", "Use logos or stamps with transparent backgrounds"),
          t("watermark.tooltip.file.recommendations.bullet2", "Simple designs work better than complex images"),
          t("watermark.tooltip.file.recommendations.bullet3", "Consider the final document size when choosing resolution")
        ]
      }
    ]
  };
};

export const useWatermarkFormattingTips = (): TooltipContent => {
  const { t } = useTranslation();
  const { appearanceTip, spacingTip } = useSharedWatermarkContent();

  return {
    header: {
      title: t("watermark.tooltip.formatting.header.title", "Formatting & Layout")
    },
    tips: [
      {
        title: t("watermark.tooltip.formatting.size.title", "Size Control"),
        description: t("watermark.tooltip.formatting.size.text", "Adjust the size of your watermark (text or image)."),
        bullets: [
          t("watermark.tooltip.formatting.size.bullet1", "Larger sizes create more prominent watermarks")
        ]
      },
      appearanceTip,
      spacingTip,
      {
        title: t("watermark.tooltip.formatting.security.title", "Security Option"),
        description: t("watermark.tooltip.formatting.security.text", "Convert the final PDF to an image-based format for enhanced security."),
        bullets: [
          t("watermark.tooltip.formatting.security.bullet1", "Prevents text selection and copying"),
          t("watermark.tooltip.formatting.security.bullet2", "Makes watermarks harder to remove"),
          t("watermark.tooltip.formatting.security.bullet3", "Results in larger file sizes"),
          t("watermark.tooltip.formatting.security.bullet4", "Best for sensitive or copyrighted content")
        ]
      }
    ]
  };
};