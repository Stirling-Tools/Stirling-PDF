import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

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

export const useWatermarkContentTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("watermark.tooltip.content.header.title", "Content Configuration")
    },
    tips: [
      {
        title: t("watermark.tooltip.content.text.title", "Text Settings"),
        description: t("watermark.tooltip.content.text.text", "Configure your text watermark appearance and language support."),
        bullets: [
          t("watermark.tooltip.content.text.bullet1", "Enter your watermark text"),
          t("watermark.tooltip.content.text.bullet2", "Adjust font size (8-72pt)"),
          t("watermark.tooltip.content.text.bullet3", "Select language/script support"),
          t("watermark.tooltip.content.text.bullet4", "Choose custom colors")
        ]
      },
      {
        title: t("watermark.tooltip.content.language.title", "Language Support"),
        description: t("watermark.tooltip.content.language.text", "Choose the appropriate language setting to ensure proper font rendering for your text."),
        bullets: [
          t("watermark.tooltip.content.language.bullet1", "Roman/Latin for Western languages"),
          t("watermark.tooltip.content.language.bullet2", "Arabic for Arabic script"),
          t("watermark.tooltip.content.language.bullet3", "Japanese, Korean, Chinese for Asian languages"),
          t("watermark.tooltip.content.language.bullet4", "Thai for Thai script")
        ]
      }
    ]
  };
};

export const useWatermarkStyleTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("watermark.tooltip.style.header.title", "Style & Positioning")
    },
    tips: [
      {
        title: t("watermark.tooltip.style.appearance.title", "Appearance Settings"),
        description: t("watermark.tooltip.style.appearance.text", "Control how your watermark looks and blends with the document."),
        bullets: [
          t("watermark.tooltip.style.appearance.bullet1", "Rotation: -360° to 360° for angled watermarks"),
          t("watermark.tooltip.style.appearance.bullet2", "Opacity: 0-100% for transparency control"),
          t("watermark.tooltip.style.appearance.bullet3", "Lower opacity creates subtle watermarks")
        ]
      },
      {
        title: t("watermark.tooltip.style.spacing.title", "Spacing Control"),
        description: t("watermark.tooltip.style.spacing.text", "Adjust the spacing between repeated watermarks across the page."),
        bullets: [
          t("watermark.tooltip.style.spacing.bullet1", "Width spacing: Horizontal distance between watermarks"),
          t("watermark.tooltip.style.spacing.bullet2", "Height spacing: Vertical distance between watermarks"),
          t("watermark.tooltip.style.spacing.bullet3", "Higher values create more spread out patterns")
        ]
      }
    ]
  };
};

export const useWatermarkAdvancedTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("watermark.tooltip.advanced.header.title", "Advanced Options")
    },
    tips: [
      {
        title: t("watermark.tooltip.advanced.conversion.title", "PDF to Image Conversion"),
        description: t("watermark.tooltip.advanced.conversion.text", "Convert the final PDF to an image-based format for enhanced security."),
        bullets: [
          t("watermark.tooltip.advanced.conversion.bullet1", "Prevents text selection and copying"),
          t("watermark.tooltip.advanced.conversion.bullet2", "Makes watermarks harder to remove"),
          t("watermark.tooltip.advanced.conversion.bullet3", "Results in larger file sizes"),
          t("watermark.tooltip.advanced.conversion.bullet4", "Best for sensitive or copyrighted content")
        ]
      },
      {
        title: t("watermark.tooltip.advanced.security.title", "Security Considerations"),
        description: t("watermark.tooltip.advanced.security.text", "Image-based PDFs provide additional protection against unauthorized editing and content extraction.")
      }
    ]
  };
};