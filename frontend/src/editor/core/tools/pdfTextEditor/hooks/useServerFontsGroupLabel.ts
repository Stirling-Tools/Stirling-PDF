import { useTranslation } from "react-i18next";

/**
 * Heading for the fonts the backend supplies in the font picker. A seam: a
 * build whose backend is not a server the user thinks of as one names it
 * differently.
 */
export function useServerFontsGroupLabel(): string {
  const { t } = useTranslation();
  return t("pdfTextEditor.fontPicker.serverGroup", "Server fonts");
}
