import type { LogoVariant } from "@app/services/preferencesService";

export const LOGO_FOLDER_BY_VARIANT: Record<LogoVariant, string> = {
  modern: "modern-logo",
  classic: "classic-logo",
};

/**
 * Wordmark filenames per variant. The modern wordmark dropped "PDF" from the
 * artwork, so it is a different file rather than a same-named copy.
 */
export const WORDMARK_FILES_BY_VARIANT: Record<
  LogoVariant,
  { black: string; grey: string; white: string }
> = {
  modern: {
    black: "StirlingLogoBlackText.svg",
    // No modern grey artwork exists; muted falls back to the black wordmark.
    grey: "StirlingLogoBlackText.svg",
    white: "StirlingLogoWhiteText.svg",
  },
  classic: {
    black: "StirlingPDFLogoBlackText.svg",
    grey: "StirlingPDFLogoGreyText.svg",
    white: "StirlingPDFLogoWhiteText.svg",
  },
};

export const ensureLogoVariant = (value?: string | null): LogoVariant => {
  return value === "classic" ? "classic" : "modern";
};

export const getLogoFolder = (variant?: LogoVariant | null): string => {
  return LOGO_FOLDER_BY_VARIANT[ensureLogoVariant(variant)];
};
